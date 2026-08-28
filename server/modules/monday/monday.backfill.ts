/**
 * monday -> our cache backfill.
 *
 * Deliberately NOT a port of `hubspot-backfill.ts`. Three rules differ,
 * and each one exists because of a specific way the HubSpot version could
 * lose data:
 *
 *  1. **It never deletes.** The HubSpot backfill has a cleanup pass that
 *     DELETEs companies whose type stopped matching a filter — and
 *     calculator_configs cascade with them, uncounted. Here, a row that is
 *     absent from its board is FLAGGED (`crm_missing_since`) and nothing
 *     else. Only an explicit `item_deleted` event may ever mark a row
 *     deleted, because absence has innocent causes: a paging glitch, a
 *     permissions change, or a backfill that ran before the remap.
 *
 *  2. **Flagging is self-limiting.** If a pass would flag more than 5% of
 *     bound rows, it aborts and changes nothing. A backfill run before the
 *     remap sees every row as unbound and would otherwise flag all 76 at
 *     once — which, with the purge guard reading that flag, would be a
 *     very bad afternoon.
 *
 *  3. **It writes shared columns only when monday is authoritative.**
 *     While CRM_PROVIDER is still 'hubspot' this pass touches ONLY the
 *     monday-owned binding columns, so the two syncs cannot fight over
 *     `name` or `company_type` (decision D12: dual reads, single-provider
 *     writes).
 */

import { sql } from "drizzle-orm";
import { db } from "../../db/client";
import { env } from "../../config/env";
import { CrmUnreachableError } from "../../shared/errors";
import { logger } from "../../middleware/logger";
import { monday } from "./monday.client";
import {
  AGENT_COLUMNS,
  COMPANY_COLUMNS,
  DEAL_COLUMNS,
  resolveBoardColumns,
  type ResolvedColumns
} from "./monday.columns";
import {
  mapCompanyBinding,
  mapCompanyDisplay,
  mapDealBinding,
  mapDealDisplay
} from "./monday.mapper";
import type { MondayItem } from "./monday.types";

/** Above this share of bound rows going missing, abort and change nothing. */
const MISSING_ABORT_RATIO = 0.05;

export interface BackfillStats {
  companies: { seen: number; updated: number; inserted: number; missing: number };
  deals: { seen: number; updated: number; inserted: number; missing: number };
  aborted: string | null;
}

export function emptyStats(): BackfillStats {
  return {
    companies: { seen: 0, updated: 0, inserted: 0, missing: 0 },
    deals: { seen: 0, updated: 0, inserted: 0, missing: 0 },
    aborted: null
  };
}

/** True when monday owns the shared display columns. */
function mondayIsAuthoritative(): boolean {
  return env.CRM_PROVIDER === "monday";
}

async function loadAllActiveItems(boardId: string, label: string): Promise<MondayItem[]> {
  const all: MondayItem[] = [];
  let cursor: string | null = null;
  const MAX_PAGES = 50;
  let page = 0;
  for (; page < MAX_PAGES; page++) {
    const res = await monday.listBoardItems(boardId, cursor, 100);
    // Recycle-bin items come back IN FULL with state !== 'active'. Caching
    // one would resurrect a card the operator deliberately removed.
    all.push(...res.items.filter(i => (i.state ?? "active") === "active"));
    cursor = res.cursor ?? null;
    if (!cursor) break;
  }
  // Running out of pages is NOT the end of the board. Falling through
  // silently would hand `flagMissing` a truncated seen-list, and every
  // bound row past the cut-off would be flagged as absent from its board
  // — a data-integrity error reported as a successful pass. Refuse
  // instead: a partial read must never be mistaken for a complete one.
  if (cursor) {
    throw new CrmUnreachableError(
      `monday board ${boardId} (${label}) still had more pages after ${MAX_PAGES} — refusing to treat a partial read as the whole board. Raise the page cap.`,
      { boardId, label, pagesRead: page, itemsRead: all.length }
    );
  }
  logger.info({ boardId, label, items: all.length }, "[monday:backfill] board loaded");
  return all;
}

/**
 * A monday-native company has no HubSpot id, but `hubspot_company_id` is
 * NOT NULL UNIQUE and is the FK target for deals. Rather than dropping the
 * NOT NULL — which can never be re-added once a single NULL exists, and
 * would forfeit reversibility permanently — monday-native rows get a
 * synthetic natural key. The `mon:` prefix makes their origin obvious in
 * any query, and it can never collide with a numeric HubSpot id.
 */
function syntheticKey(itemId: string): string {
  return `mon:${itemId}`;
}

async function upsertCompanies(
  items: MondayItem[],
  boardId: string,
  cols: ResolvedColumns,
  kind: "merchant" | "agent",
  stats: BackfillStats
): Promise<void> {
  for (const item of items) {
    await upsertOneCompany(item, boardId, cols, kind, stats);
  }
}

/**
 * Upsert a SINGLE company. Shared by the board-wide backfill loop above
 * and by the webhook processor, so a change arriving by either route
 * lands in the database through exactly the same code.
 */
export async function upsertOneCompany(
  item: MondayItem,
  boardId: string,
  cols: ResolvedColumns,
  kind: "merchant" | "agent",
  stats: BackfillStats = emptyStats()
): Promise<void> {
  {
    const binding = mapCompanyBinding(item, boardId);
    const display = mapCompanyDisplay(item, cols, kind);
    stats.companies.seen += 1;

    const existing = await db.execute<{ id: string }>(sql`
      SELECT id FROM companies WHERE crm_item_id = ${item.id} LIMIT 1
    `);

    if (existing.rows.length > 0) {
      // Bound row: refresh binding columns always; display columns only
      // when monday owns them. `crm_missing_since` is cleared because we
      // have just seen the item alive on its board.
      await db.execute(sql`
        UPDATE companies SET
          crm_board_id = ${binding.crmBoardId},
          monday_raw = ${JSON.stringify(binding.mondayRaw)}::jsonb,
          crm_created_at = ${binding.crmCreatedAt},
          crm_updated_at = ${binding.crmUpdatedAt},
          -- Seeing the item ALIVE on its board clears every "gone" marker,
          -- not just the soft one. Without clearing crm_deleted_at a client
          -- that was archived and then restored in monday would stay badged
          -- as deleted forever — and, because the purge guard accepts that
          -- flag, would stay permanently purge-eligible. The HubSpot twin
          -- (companies.repository.ts upsertCompany) has always cleared its
          -- equivalent for exactly this reason.
          crm_missing_since = NULL,
          crm_deleted_at = NULL,
          crm_deleted_reason = NULL,
          name = CASE WHEN ${mondayIsAuthoritative()} THEN ${display.name ?? null} ELSE name END,
          company_type = CASE WHEN ${mondayIsAuthoritative()} THEN ${display.companyType ?? null} ELSE company_type END,
          lifecycle_stage = CASE WHEN ${mondayIsAuthoritative()} AND ${display.lifecycleStage !== undefined}
                                 THEN ${display.lifecycleStage ?? null} ELSE lifecycle_stage END,
          segment_type = CASE WHEN ${mondayIsAuthoritative()} AND ${display.segmentType !== undefined}
                              THEN ${display.segmentType ?? null} ELSE segment_type END,
          updated_at = now()
        WHERE crm_item_id = ${item.id}
      `);
      stats.companies.updated += 1;
      return;
    }

    // Unbound item = a client created in monday after the remap. This is
    // the path that makes "a new client shows up in the wizard" work.
    await db.execute(sql`
      INSERT INTO companies (
        hubspot_company_id, name, company_type, lifecycle_stage, segment_type,
        hubspot_created_at, hubspot_modified_at, hubspot_raw,
        crm_item_id, crm_board_id, crm_binding_role, monday_raw,
        crm_created_at, crm_updated_at, last_synced_at
      ) VALUES (
        ${syntheticKey(item.id)}, ${display.name ?? item.name}, ${display.companyType ?? null},
        ${display.lifecycleStage ?? null}, ${display.segmentType ?? null},
        ${binding.crmCreatedAt ?? new Date()}, ${binding.crmUpdatedAt ?? new Date()}, '{}'::jsonb,
        ${item.id}, ${boardId}, 'primary', ${JSON.stringify(binding.mondayRaw)}::jsonb,
        ${binding.crmCreatedAt}, ${binding.crmUpdatedAt}, now()
      )
      ON CONFLICT (hubspot_company_id) DO NOTHING
    `);
    stats.companies.inserted += 1;
    logger.info(
      { itemId: item.id, name: item.name, kind },
      "[monday:backfill] new company created in monday — now available in the app"
    );
  }
}

async function upsertDeals(
  items: MondayItem[],
  boardId: string,
  cols: ResolvedColumns,
  stats: BackfillStats
): Promise<void> {
  for (const item of items) {
    await upsertOneDeal(item, boardId, cols, stats);
  }
}

/** Single-deal counterpart of `upsertOneCompany`. */
export async function upsertOneDeal(
  item: MondayItem,
  boardId: string,
  cols: ResolvedColumns,
  stats: BackfillStats = emptyStats()
): Promise<void> {
  {
    const binding = mapDealBinding(item, boardId, cols);
    const display = mapDealDisplay(item, cols);
    stats.deals.seen += 1;

    const existing = await db.execute<{ id: string }>(sql`
      SELECT id FROM deals WHERE crm_item_id = ${item.id} LIMIT 1
    `);

    if (existing.rows.length > 0) {
      await db.execute(sql`
        UPDATE deals SET
          crm_board_id = ${binding.crmBoardId},
          crm_company_item_id = ${binding.crmCompanyItemId},
          monday_raw = ${JSON.stringify(binding.mondayRaw)}::jsonb,
          crm_created_at = ${binding.crmCreatedAt},
          crm_updated_at = ${binding.crmUpdatedAt},
          -- Seeing the item ALIVE on its board clears every "gone" marker,
          -- not just the soft one. Without clearing crm_deleted_at a client
          -- that was archived and then restored in monday would stay badged
          -- as deleted forever — and, because the purge guard accepts that
          -- flag, would stay permanently purge-eligible. The HubSpot twin
          -- (companies.repository.ts upsertCompany) has always cleared its
          -- equivalent for exactly this reason.
          crm_missing_since = NULL,
          -- deals has crm_deleted_at but NOT crm_deleted_reason: migration
          -- 0021 added the reason column only to companies, where the
          -- archived-vs-deleted distinction matters for the purge guard.
          -- Writing it here made every bound-deal upsert fail with a SQL
          -- error - invisible to the test suite, which does not cover the
          -- backfill, and to the manual run, which predated the line.
          -- (Backticks are banned in these comments: they terminate the
          -- surrounding sql template literal.)
          crm_deleted_at = NULL,
          name = CASE WHEN ${mondayIsAuthoritative()} THEN ${display.name ?? null} ELSE name END,
          stage = CASE WHEN ${mondayIsAuthoritative()} THEN ${display.stage ?? null} ELSE stage END,
          updated_at = now()
        WHERE crm_item_id = ${item.id}
      `);
      stats.deals.updated += 1;
      return;
    }

    // A new deal needs a parent that we already cache. Without one the FK
    // on hubspot_company_id cannot be satisfied, so we skip rather than
    // invent a parent — and say so loudly, because a skipped deal is
    // invisible in the UI and would otherwise be a silent gap.
    const parent = binding.crmCompanyItemId
      ? await db.execute<{ hubspot_company_id: string }>(sql`
          SELECT hubspot_company_id FROM companies
           WHERE crm_item_id = ${binding.crmCompanyItemId} AND crm_binding_role = 'primary'
           LIMIT 1
        `)
      : { rows: [] as Array<{ hubspot_company_id: string }> };

    if (parent.rows.length === 0) {
      logger.warn(
        { itemId: item.id, name: item.name, companyItemId: binding.crmCompanyItemId },
        "[monday:backfill] deal skipped — its Company (M) link points at a company we do not cache yet"
      );
      return;
    }

    await db.execute(sql`
      INSERT INTO deals (
        hubspot_deal_id, hubspot_company_id, name, stage,
        hubspot_created_at, hubspot_modified_at, hubspot_raw,
        crm_item_id, crm_board_id, crm_company_item_id, monday_raw,
        crm_created_at, crm_updated_at, last_synced_at
      ) VALUES (
        ${syntheticKey(item.id)}, ${parent.rows[0].hubspot_company_id},
        ${display.name ?? item.name}, ${display.stage ?? null},
        ${binding.crmCreatedAt ?? new Date()}, ${binding.crmUpdatedAt ?? new Date()}, '{}'::jsonb,
        ${item.id}, ${boardId}, ${binding.crmCompanyItemId}, ${JSON.stringify(binding.mondayRaw)}::jsonb,
        ${binding.crmCreatedAt}, ${binding.crmUpdatedAt}, now()
      )
      ON CONFLICT (hubspot_deal_id) DO NOTHING
    `);
    stats.deals.inserted += 1;
  }
}

/**
 * Flag bound rows that were not seen on their board. OBSERVATION ONLY —
 * see the header. Aborts rather than flagging a suspiciously large share.
 */
export async function flagMissing(
  table: "companies" | "deals",
  seenIds: string[],
  stats: BackfillStats
): Promise<string | null> {
  const bound = await db.execute<{ n: number }>(
    table === "companies"
      ? sql`SELECT count(*)::int AS n FROM companies WHERE crm_item_id IS NOT NULL`
      : sql`SELECT count(*)::int AS n FROM deals WHERE crm_item_id IS NOT NULL`
  );
  const total = Number(bound.rows[0]?.n ?? 0);
  if (total === 0) {
    return `${table}: nothing is bound yet — refusing to flag anything (run the remap first)`;
  }

  // Serialised to ONE jsonb bind parameter, deliberately not passed as a
  // JS array: drizzle expands an array into a row constructor -- ($1, $2,
  // ...$114) -- and `<> ALL(row)` is not valid Postgres, so every backfill
  // run aborted here with a syntax error. jsonb also sidesteps the 65535
  // bind-parameter ceiling once the board outgrows a few thousand items.
  const idListJson = JSON.stringify(seenIds.length > 0 ? seenIds : ["__none__"]);
  const candidates = await db.execute<{ n: number }>(
    table === "companies"
      ? sql`SELECT count(*)::int AS n FROM companies
             WHERE crm_item_id IS NOT NULL AND crm_item_id NOT IN (SELECT jsonb_array_elements_text(${idListJson}::jsonb)) AND crm_missing_since IS NULL`
      : sql`SELECT count(*)::int AS n FROM deals
             WHERE crm_item_id IS NOT NULL AND crm_item_id NOT IN (SELECT jsonb_array_elements_text(${idListJson}::jsonb)) AND crm_missing_since IS NULL`
  );
  const newlyMissing = Number(candidates.rows[0]?.n ?? 0);

  if (newlyMissing / total > MISSING_ABORT_RATIO) {
    return `${table}: ${newlyMissing} of ${total} bound rows are absent from the board (> ${
      MISSING_ABORT_RATIO * 100
    }%) — aborting without flagging anything. This usually means a partial fetch, not ${newlyMissing} deletions.`;
  }

  if (newlyMissing > 0) {
    await db.execute(
      table === "companies"
        ? sql`UPDATE companies SET crm_missing_since = now()
               WHERE crm_item_id IS NOT NULL AND crm_item_id NOT IN (SELECT jsonb_array_elements_text(${idListJson}::jsonb)) AND crm_missing_since IS NULL`
        : sql`UPDATE deals SET crm_missing_since = now()
               WHERE crm_item_id IS NOT NULL AND crm_item_id NOT IN (SELECT jsonb_array_elements_text(${idListJson}::jsonb)) AND crm_missing_since IS NULL`
    );
    logger.warn({ table, newlyMissing, total }, "[monday:backfill] rows flagged as missing from their board");
  }
  if (table === "companies") stats.companies.missing = newlyMissing;
  else stats.deals.missing = newlyMissing;
  return null;
}

export async function runMondayBackfill(): Promise<BackfillStats> {
  const stats: BackfillStats = emptyStats();

  if (!monday.isConfigured()) {
    stats.aborted = "MONDAY_API_TOKEN is not set";
    return stats;
  }
  if (!monday.isVersionAsserted) await monday.assertApiVersion();

  const companyCols = await resolveBoardColumns(env.MONDAY_BOARD_COMPANIES, COMPANY_COLUMNS);
  const agentCols = await resolveBoardColumns(env.MONDAY_BOARD_AGENTS, AGENT_COLUMNS);
  const dealCols = await resolveBoardColumns(env.MONDAY_BOARD_DEALS, DEAL_COLUMNS);

  const merchants = await loadAllActiveItems(env.MONDAY_BOARD_COMPANIES, "merchants");
  const agents = await loadAllActiveItems(env.MONDAY_BOARD_AGENTS, "agents");
  const deals = await loadAllActiveItems(env.MONDAY_BOARD_DEALS, "deals");

  await upsertCompanies(merchants, env.MONDAY_BOARD_COMPANIES, companyCols, "merchant", stats);
  await upsertCompanies(agents, env.MONDAY_BOARD_AGENTS, agentCols, "agent", stats);
  // Deals AFTER companies: a new deal needs its parent to exist first.
  await upsertDeals(deals, env.MONDAY_BOARD_DEALS, dealCols, stats);

  const abort =
    (await flagMissing("companies", [...merchants, ...agents].map(i => i.id), stats)) ??
    (await flagMissing("deals", deals.map(i => i.id), stats));
  if (abort) {
    stats.aborted = abort;
    logger.error({ reason: abort }, "[monday:backfill] flagging aborted");
  }

  logger.info({ ...stats }, "[monday:backfill] pass complete");
  return stats;
}
