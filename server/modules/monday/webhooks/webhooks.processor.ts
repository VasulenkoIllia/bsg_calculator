/**
 * monday webhook processor.
 *
 * Same proven shape as the HubSpot one: a self-rescheduling timer (never
 * setInterval, so a slow batch can't overlap itself), a bounded batch, a
 * retry budget, and rows kept for audit after they fail.
 *
 * The one rule that matters most: **the payload is only a trigger**. For
 * every event the item is re-read from the API with our own token, so a
 * forged or replayed delivery cannot inject data — at worst it costs one
 * wasted read. That is what makes an unsigned webhook acceptable
 * (monday does not sign webhooks created with a personal token).
 */

import { sql } from "drizzle-orm";
import { db } from "../../../db/client";
import { env } from "../../../config/env";
import { logger } from "../../../middleware/logger";
import type { MondayWebhookEvent } from "../../../db/schema";
import { monday } from "../monday.client";
import { classifyMondayItem } from "../monday.types";
import {
  AGENT_COLUMNS,
  COMPANY_COLUMNS,
  DEAL_COLUMNS,
  resolveBoardColumns,
  type ResolvedColumns
} from "../monday.columns";
import { upsertOneCompany, upsertOneDeal } from "../monday.backfill";
import {
  listPendingMondayEvents,
  markMondayEventFailed,
  markMondayEventProcessed,
  recordMondayEventFailure
} from "./webhooks.repository";

const MAX_ATTEMPTS = 5;
const BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 5_000;

/**
 * Column maps are cached, but only briefly.
 *
 * A permanent cache would mean a column recreated in monday keeps
 * resolving to the OLD id for as long as the process lives — and since
 * the resolver only fails loud at resolution time, the mapper would
 * quietly write NULLs in the meantime. Boards were rebuilt four times in
 * the week this was written, so the TTL is deliberately short:
 * `resolveBoardColumns` is one cheap query.
 */
const COLUMN_CACHE_TTL_MS = 5 * 60 * 1000;
const columnCache = new Map<string, { at: number; cols: ResolvedColumns }>();
async function columnsFor(boardId: string, objectType: "company" | "agent" | "deal") {
  const cached = columnCache.get(boardId);
  if (cached && Date.now() - cached.at < COLUMN_CACHE_TTL_MS) return cached.cols;
  const specs =
    objectType === "deal" ? DEAL_COLUMNS : objectType === "agent" ? AGENT_COLUMNS : COMPANY_COLUMNS;
  const resolved = await resolveBoardColumns(boardId, specs);
  columnCache.set(boardId, { at: Date.now(), cols: resolved });
  return resolved;
}

/**
 * An item left its board (deleted, archived, or moved out of scope).
 *
 * NEVER a blind DELETE. A company that owns documents or calculators is
 * KEPT and flagged: documents are legal records protected by an
 * ON DELETE RESTRICT foreign key, and calculator_configs would CASCADE
 * away silently and uncounted — the exact hole the HubSpot guard left
 * open, because it only ever checked for documents.
 */
async function flagDeleted(
  objectType: "company" | "agent" | "deal",
  itemId: string,
  reason: "deleted" | "archived"
): Promise<"flagged_deleted" | "skipped"> {
  if (objectType === "deal") {
    await db.execute(sql`
      UPDATE deals SET crm_deleted_at = now() WHERE crm_item_id = ${itemId}
    `);
    return "flagged_deleted";
  }

  // The unit of work is the monday ITEM, not a single row. Eight of our
  // companies are duplicate pairs bound to ONE monday item, so an
  // unordered LIMIT 1 could land on the empty half of a pair and
  // hard-delete it while the half holding the documents is the one the
  // operator actually removed from the CRM. Aggregate the whole group.
  const group = await db.execute<{ rows: number; documents: number; calcs: number }>(sql`
    SELECT count(*)::int AS rows,
           COALESCE(sum((SELECT count(*) FROM documents d WHERE d.company_id = c.id)), 0)::int AS documents,
           COALESCE(sum((SELECT count(*) FROM calculator_configs k WHERE k.company_id = c.id)), 0)::int AS calcs
      FROM companies c WHERE c.crm_item_id = ${itemId}
  `);
  if (Number(group.rows[0]?.rows ?? 0) === 0) return "skipped";

  const documents = Number(group.rows[0].documents);
  const calcs = Number(group.rows[0].calcs);

  await db.execute(sql`
    UPDATE companies
       SET crm_deleted_at = now(), crm_deleted_reason = ${reason}
     WHERE crm_item_id = ${itemId}
  `);

  // Archiving is NOT a deletion, even for a company that owns nothing.
  // It is a reversible, one-click tidy-up in monday, and un-archiving is
  // expected to bring the client straight back; hard-deleting the row here
  // would silently drop its local id and its binding, so the restored item
  // would come back through the backfill as a NEW company. The flag above
  // is enough — the badge shows it, the purge guard refuses it, and a real
  // delete event (or the operator) can still remove it later.
  if (reason === "archived") {
    logger.info(
      { itemId, documents, calcs },
      "[monday:webhook] company ARCHIVED in the CRM — flagged only, never deleted (archiving is reversible)"
    );
    return "flagged_deleted";
  }

  if (documents === 0 && calcs === 0) {
    // The WHOLE group owns nothing — safe to remove, in one transaction so
    // a half-applied state is never observable.
    // The DELETE re-checks ownership ITSELF rather than trusting the count
    // read a moment earlier: an operator saving a calculator between the
    // two statements would otherwise have it deleted by a cascade, with no
    // trace anywhere. Making check and write one statement closes the
    // window entirely — if anything was created in between, the DELETE
    // simply matches no rows and the flag stays.
    await db.transaction(async tx => {
      await tx.execute(sql`
        DELETE FROM deals WHERE hubspot_company_id IN (
          SELECT hubspot_company_id FROM companies WHERE crm_item_id = ${itemId}
        )
      `);
      const removed = await tx.execute(sql`
        DELETE FROM companies c
         WHERE c.crm_item_id = ${itemId}
           AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.company_id = c.id)
           AND NOT EXISTS (SELECT 1 FROM calculator_configs k WHERE k.company_id = c.id)
        RETURNING c.id
      `);
      if ((removed.rowCount ?? 0) === 0) {
        logger.warn(
          { itemId },
          "[monday:webhook] hard-delete skipped — work was attached to the company between the ownership check and the delete; the row is kept and stays flagged"
        );
      }
    });
    logger.info(
      { itemId, rows: group.rows[0].rows },
      "[monday:webhook] company removed from the CRM and owned nothing — deleted"
    );
  } else {
    logger.warn(
      { itemId, documents, calcs },
      "[monday:webhook] company removed from the CRM but owns work — rows KEPT and flagged"
    );
  }
  return "flagged_deleted";
}

/**
 * Record that an item was not returned by the API. An OBSERVATION only —
 * it drives a badge and an ops alert and must never authorise a purge.
 */
async function markMissing(
  objectType: "company" | "agent" | "deal",
  itemId: string
): Promise<void> {
  if (objectType === "deal") {
    await db.execute(sql`
      UPDATE deals SET crm_missing_since = COALESCE(crm_missing_since, now())
       WHERE crm_item_id = ${itemId}`);
  } else {
    await db.execute(sql`
      UPDATE companies SET crm_missing_since = COALESCE(crm_missing_since, now())
       WHERE crm_item_id = ${itemId}`);
  }
  logger.warn(
    { objectType, itemId },
    "[monday:webhook] item not returned by the API — flagged as missing, NOT deleted"
  );
}

async function processOne(event: MondayWebhookEvent): Promise<
  "upserted" | "flagged_deleted" | "restored" | "skipped"
> {
  if (event.eventType === "item_deleted" || event.eventType === "item_archived") {
    // CONFIRM against the API before acting. Taking the payload's word for
    // a deletion is the one place where "the payload is only a trigger"
    // would have been untrue — and it is also the most destructive branch,
    // since a company owning nothing gets hard-deleted here. A forged or
    // replayed delivery must not be able to remove a live company.
    const check = await monday.getItemsById([event.itemId]);
    const state = classifyMondayItem(event.itemId, [...check.values()]);
    if (state.liveness === "active") {
      logger.warn(
        { itemId: event.itemId, eventType: event.eventType },
        "[monday:webhook] delete/archive event, but the API reports the item as ACTIVE — ignoring the event and re-syncing instead"
      );
      const cols = await columnsFor(event.boardId, event.objectType);
      if (event.objectType === "deal") await upsertOneDeal(state.item!, event.boardId, cols);
      else
        await upsertOneCompany(
          state.item!,
          event.boardId,
          cols,
          event.objectType === "agent" ? "agent" : "merchant"
        );
      return "upserted";
    }
    // ABSENCE IS STILL NOT PROOF, even on a delete event. If the API does
    // not return the item we cannot distinguish "really deleted" from a
    // permissions change or a transient failure — and this branch is the
    // one that can HARD-DELETE a company. The sibling branch below already
    // refuses to act on absence; treating it as confirmation here would
    // have contradicted that within the same function.
    //
    // A monday DELETE genuinely does remove the item from items(ids:), so
    // the common case still resolves — on the NEXT event or the next
    // backfill, once the row has carried crm_missing_since long enough for
    // an operator to see it. Nothing is lost by waiting; a wrong
    // hard-delete cannot be undone.
    if (state.liveness === "gone") {
      await markMissing(event.objectType, event.itemId);
      logger.warn(
        { itemId: event.itemId, eventType: event.eventType },
        "[monday:webhook] delete/archive event, but the API does not return the item at all — flagged as missing rather than deleted, because absence cannot be told apart from a permissions or transport failure"
      );
      return "skipped";
    }

    // Present but recycled — a CONFIRMED removal. Trust the API's own word
    // for which kind it was rather than the event name: an item can be
    // archived and then deleted between the trigger and our read.
    return flagDeleted(
      event.objectType,
      event.itemId,
      state.item?.state === "archived" ? "archived" : "deleted"
    );
  }

  // Everything else: re-read the item and let the state decide. Note that
  // a recycled item comes back IN FULL with state !== 'active' — it does
  // not 404 — so liveness is read from the field, never inferred from a
  // successful fetch.
  const items = await monday.getItemsById([event.itemId]);
  const { liveness, item } = classifyMondayItem(event.itemId, [...items.values()]);

  if (liveness === "gone" || !item) {
    // ABSENCE IS NOT A DELETION. An id missing from `items(ids:)` can also
    // mean a permissions change, a board move, or a transient API hiccup —
    // and this module's sibling (the backfill) already refuses to treat
    // absence as a delete for exactly that reason. Record the observation
    // in the column 0021 added for it and stop; only an explicit
    // item_deleted event, confirmed above, may flag or remove a row.
    await markMissing(event.objectType, event.itemId);
    return "skipped";
  }
  if (liveness === "recycled") {
    // Present but in the recycle bin — that IS a confirmed removal, and
    // the state tells us which kind.
    return flagDeleted(
      event.objectType,
      event.itemId,
      item.state === "archived" ? "archived" : "deleted"
    );
  }

  const cols = await columnsFor(event.boardId, event.objectType);
  if (event.objectType === "deal") {
    await upsertOneDeal(item, event.boardId, cols);
  } else {
    await upsertOneCompany(
      item,
      event.boardId,
      cols,
      event.objectType === "agent" ? "agent" : "merchant"
    );
  }
  // The upsert above clears crm_missing_since AND crm_deleted_at — seeing
  // the item alive is proof it is not gone. An explicit restore is still
  // reported as such so the audit trail distinguishes "came back" from
  // "was updated".
  return event.eventType === "item_restored" ? "restored" : "upserted";
}

export async function processMondayWebhookBatch(): Promise<{ processed: number; failed: number }> {
  const events = await listPendingMondayEvents(BATCH_SIZE);
  let processed = 0;
  let failed = 0;

  for (const event of events) {
    try {
      const outcome = await processOne(event);
      await markMondayEventProcessed(event.id, outcome);
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (event.attempts + 1 >= MAX_ATTEMPTS) {
        await markMondayEventFailed(event.id, message);
        failed += 1;
        logger.warn(
          { eventKey: event.eventKey, itemId: event.itemId, err: message },
          "[monday:webhook] event exhausted its retry budget — marked failed"
        );
      } else {
        await recordMondayEventFailure(event.id, message);
        logger.warn(
          { eventKey: event.eventKey, itemId: event.itemId, attempts: event.attempts + 1, err: message },
          "[monday:webhook] event failed — will retry"
        );
      }
    }
  }

  if (events.length > 0) {
    logger.info({ processed, failed, batch: events.length }, "[monday:webhook] batch complete");
  }
  return { processed, failed };
}

// Self-rescheduling timer: the next tick is armed only after the previous
// batch resolves, so a slow batch can never overlap itself and claim the
// same pending rows twice.
let timer: ReturnType<typeof setTimeout> | null = null;
let running = false;
let stopRequested = false;

async function tick(): Promise<void> {
  if (stopRequested) return;
  if (running) {
    schedule();
    return;
  }
  running = true;
  try {
    await processMondayWebhookBatch();
  } catch (err) {
    logger.error({ err: (err as Error).message }, "[monday:webhook] batch threw — retrying next tick");
  } finally {
    running = false;
    schedule();
  }
}

function schedule(): void {
  if (stopRequested) return;
  timer = setTimeout(() => void tick(), POLL_INTERVAL_MS);
  timer.unref?.();
}

export function startMondayWebhookProcessor(): void {
  if (env.NODE_ENV === "test") return;
  if (timer) return;
  stopRequested = false;
  logger.info({ pollMs: POLL_INTERVAL_MS, batchSize: BATCH_SIZE }, "[monday:webhook] processor started");
  schedule();
}

export function stopMondayWebhookProcessor(): void {
  stopRequested = true;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
