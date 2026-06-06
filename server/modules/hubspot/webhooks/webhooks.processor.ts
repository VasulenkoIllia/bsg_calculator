/**
 * Async webhook event processor.
 *
 * Receiver inserts rows into `hubspot_webhook_events` with
 * `status = 'pending'` and returns 200 immediately. THIS module
 * runs in a `setInterval(5000)` loop in the same process,
 * processing the queue:
 *
 *   1. Pick the next batch of pending events ordered by occurredAt.
 *   2. For each event:
 *      a. Fetch the object from HubSpot (via existing hubspot.client).
 *      b. company.creation / company.propertyChange:
 *           - Map → upsert into companies. If company_type doesn't
 *             match HUBSPOT_COMPANY_TYPE_FILTER → mark `filtered_out`.
 *      c. company.deletion: DELETE FROM companies WHERE
 *           hubspot_company_id = X. Use the same id from the event;
 *           skip the HubSpot fetch (HubSpot returns 404 for
 *           deleted objects).
 *      d. deal.* same shape but on deals table.
 *   3. Mark row processed (success outcome) or record failure.
 *   4. Retry budget: events with attempts >= MAX_ATTEMPTS get
 *      promoted to `status = 'failed'` so the worker stops touching
 *      them. They stay in the DB for audit.
 *
 * Single-replica safe (Sprint 7 docker is single-replica). Multi-
 * replica would need either pg advisory locks or a Redis-backed
 * queue — TODO in decisions.md.
 */

import { db } from "../../../db/client";
import { type HubspotWebhookEvent } from "../../../db/schema";
import { env } from "../../../config/env";
import { logger } from "../../../middleware/logger";
import { HubspotUnreachableError } from "../../../shared/errors";
import { hubspot, isHubspotNotFound } from "../hubspot.client";
import { mapHubspotCompanyToRow, mapHubspotDealToRow } from "../hubspot.mapper";
import {
  deleteCompanyByHubspotId,
  upsertCompany
} from "../../companies/companies.repository";
import {
  deleteDealByHubspotId,
  deleteDealsByCompanyId,
  upsertDeal
} from "../../deals/deals.repository";
import { resolveDealCompany } from "../../deals/deals.service";
import {
  handleCompanyMerge,
  handleDealMerge
} from "../../companies/companies.merge.service";
import {
  listPendingEvents,
  markFailed,
  markProcessed,
  recordFailure
} from "./webhooks.repository";
import { readMergeIds } from "./webhooks.schemas";

/** After this many failed attempts the row moves to `failed` permanently. */
const MAX_ATTEMPTS = 5;

/** How many events to process per polling tick. */
const BATCH_SIZE = 50;

/** Polling cadence. */
const POLL_INTERVAL_MS = 5_000;

/** Storage filter check — drop-on-event per pre-Sprint-5 decision. */
function passesCompanyTypeFilter(companyType: string | null | undefined): boolean {
  const filter = env.HUBSPOT_COMPANY_TYPE_FILTER;
  if (!filter || filter.length === 0) return true;
  return companyType === filter;
}

/**
 * Process exactly one event. Throws on transient failures so the
 * caller can record an attempt; returns successfully (with outcome)
 * on success or hard-skip cases.
 */
async function processOne(
  event: HubspotWebhookEvent
): Promise<"upserted" | "deleted" | "filtered_out"> {
  const isCompany = event.objectType === "company";
  const subType = event.subscriptionType;

  // Deletion: skip HubSpot fetch (object is gone), DELETE from our DB.
  // Sprint 5.F.1: company deletion wraps both DELETE statements in a
  // transaction so we never observe the intermediate state where
  // deals are gone but the company row survives. Without the TX, a
  // mid-statement process kill would leave that orphan window
  // observable to readers until the next webhook retry.
  if (subType.endsWith(".deletion")) {
    if (isCompany) {
      // Deals first because the FK is RESTRICT in our schema — the
      // company DELETE would fail with FK violation if any deal still
      // pointed at it. Both deletes share one transaction so we never
      // observe "deals gone, company survives".
      await db.transaction(async tx => {
        await deleteDealsByCompanyId(event.hubspotObjectId, tx);
        await deleteCompanyByHubspotId(event.hubspotObjectId, tx);
      });
    } else {
      await deleteDealByHubspotId(event.hubspotObjectId);
    }
    return "deleted";
  }

  // Merge: HubSpot folded one or more SECONDARY objects into a
  // surviving PRIMARY. The secondary ids 404 from now on, so leaving
  // them in our cache causes perpetual 404 GETs + 400 Note-association
  // failures (the original "(M) TEST 1 c" drift). Re-point the
  // secondaries' owned rows onto the primary (companies) or drop them
  // (deals) — see companies.merge.service. The merge participant ids
  // live in the stored `raw` event JSONB (HubSpot's primaryObjectId +
  // mergedObjectIds), which `readMergeIds` parses defensively.
  if (subType === "company.merge" || subType === "deal.merge") {
    const { primaryObjectId, mergedObjectIds } = readMergeIds(event.raw);
    // The top-level objectId on a merge event is the survivor; prefer
    // the explicit primaryObjectId, fall back to it.
    const primaryId = primaryObjectId ?? event.hubspotObjectId;
    if (isCompany) {
      await handleCompanyMerge(primaryId, mergedObjectIds);
    } else {
      await handleDealMerge(primaryId, mergedObjectIds);
    }
    // The CHECK on hubspot_webhook_events.outcome allows only
    // upserted/deleted/filtered_out; a merge's observable cache change
    // is the secondary's removal, so we record it as "deleted".
    return "deleted";
  }

  // creation / propertyChange: fetch from HubSpot, validate filter,
  // upsert. If HubSpot returns 404 (race: object was deleted between
  // the event and our processing), treat it as a delete.
  try {
    if (isCompany) {
      const obj = await hubspot.getCompany(event.hubspotObjectId);
      if (!passesCompanyTypeFilter(obj.properties.company_type)) {
        return "filtered_out";
      }
      const row = mapHubspotCompanyToRow(obj);
      if (!row) {
        // Mapper rejected the payload (malformed). Surface as a
        // hard failure so it doesn't poll the worker forever.
        throw new Error("hubspot.mapper rejected company payload");
      }
      await upsertCompany(row);
      return "upserted";
    } else {
      const obj = await hubspot.getDeal(event.hubspotObjectId);
      const row = mapHubspotDealToRow(obj);
      if (!row) {
        throw new Error(
          "hubspot.mapper rejected deal payload (orphan or malformed)"
        );
      }
      // Sprint 7.4 (audit S3) — multi-candidate fallback parity with
      // the backfill + TTL-refresh paths. The mapper picks ONE
      // company id (`hs_primary_associated_company` first), but real
      // deals like WORLDFY OY have primary = Agent (filtered out)
      // and a fallback Merchant in `associations.companies.results`.
      // Before this fix, processOne fell back to a single-id lookup
      // and silently returned "filtered_out" — losing every
      // propertyChange event for those deals. resolveDealCompany
      // walks every candidate and returns the first one we actually
      // have in our cache.
      const resolved = await resolveDealCompany(obj);
      if (!resolved) {
        return "filtered_out";
      }
      // Patch the row's company id to whichever candidate we found
      // before upserting, so the FK lands on the real parent.
      await upsertDeal({ ...row, hubspotCompanyId: resolved.hubspotCompanyId });
      return "upserted";
    }
  } catch (err) {
    // HubSpot 404 on a creation/propertyChange event means HubSpot
    // already deleted (or merged away) the object before we got around
    // to fetching it (race). Treat it as a delete. NOTE: the client
    // surfaces a 404 as HubspotUnreachableError(status=404), NOT
    // NotFoundError — detect it by status via isHubspotNotFound.
    if (isHubspotNotFound(err)) {
      // Same TX guarantee as the explicit deletion path above.
      if (isCompany) {
        await db.transaction(async tx => {
          await deleteDealsByCompanyId(event.hubspotObjectId, tx);
          await deleteCompanyByHubspotId(event.hubspotObjectId, tx);
        });
      } else {
        await deleteDealByHubspotId(event.hubspotObjectId);
      }
      return "deleted";
    }
    // HubspotUnreachableError + everything else propagates so the
    // worker records the attempt for retry.
    throw err;
  }
}

/**
 * Process one batch. Called by the interval AND by the test suite
 * (which doesn't want to spin a real interval).
 */
export async function processWebhookBatch(): Promise<{
  processed: number;
  failed: number;
}> {
  const events = await listPendingEvents({ limit: BATCH_SIZE });
  let processed = 0;
  let failed = 0;
  // Sprint 7.4 (audit S4) — token-failure circuit-breaker.
  // If HubSpot rejects our Private App token, EVERY event in the
  // queue would fail in the same way and burn 5 retry attempts
  // each (1000+ log lines for a 200-event queue before any can be
  // marked failed). The breaker tracks consecutive 401-style
  // upstream failures inside a single batch and aborts after 3,
  // so the operator gets a single loud signal + the queue waits
  // for the next batch tick (5s) when (hopefully) the token has
  // been rotated. recordFailure is still called so the attempt
  // counter advances normally.
  const TOKEN_INVALID_ABORT_THRESHOLD = 3;
  let consecutiveTokenInvalid = 0;
  for (const event of events) {
    try {
      const outcome = await processOne(event);
      await markProcessed(event.id, outcome);
      processed += 1;
      consecutiveTokenInvalid = 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const isTokenInvalid =
        err instanceof HubspotUnreachableError &&
        typeof err.details === "object" &&
        err.details !== null &&
        "status" in err.details &&
        (err.details as { status?: number }).status === 401;
      if (isTokenInvalid) {
        consecutiveTokenInvalid += 1;
      }
      const nextAttempts = event.attempts + 1;
      if (nextAttempts >= MAX_ATTEMPTS) {
        await markFailed(event.id, message);
        logger.warn(
          { eventId: event.hubspotEventId, attempts: nextAttempts, err: message },
          "[hubspot:webhook] event exhausted retry budget → marked failed"
        );
        failed += 1;
      } else {
        await recordFailure(event.id, message);
        logger.warn(
          {
            eventId: event.hubspotEventId,
            attempts: nextAttempts,
            err: message,
            isUpstream: err instanceof HubspotUnreachableError
          },
          "[hubspot:webhook] event failed — will retry"
        );
      }
      if (consecutiveTokenInvalid >= TOKEN_INVALID_ABORT_THRESHOLD) {
        logger.error(
          {
            code: "HUBSPOT_TOKEN_INVALID",
            consecutiveTokenInvalid,
            remainingInBatch: events.length - events.indexOf(event) - 1
          },
          "[hubspot:webhook] aborting batch: 3 consecutive HUBSPOT_TOKEN_INVALID failures. Rotate HUBSPOT_API_TOKEN and restart."
        );
        break;
      }
    }
  }
  if (events.length > 0) {
    logger.info(
      { processed, failed, batch: events.length },
      "[hubspot:webhook] batch complete"
    );
  }
  return { processed, failed };
}

// Sprint 5.F.1: self-rescheduling setTimeout replaces setInterval to
// eliminate the re-entrancy race where a long-running batch (HubSpot
// 502 storm hitting the 30s per-event fetch timeout × 50 events ≫
// the 5s poll interval) could spawn an overlapping second batch that
// would claim the same `pending` rows. With setTimeout the next tick
// fires only AFTER the previous batch resolves — single-replica
// processor stays serial without needing pg advisory locks.
let processorTimeout: ReturnType<typeof setTimeout> | null = null;
let processorRunning = false;
let processorStopRequested = false;

async function runBatchAndReschedule(): Promise<void> {
  if (processorStopRequested) return;
  if (processorRunning) {
    // Defensive: should be impossible because the timer is set only
    // in the finally block below. If we ever land here it means
    // someone manually invoked the scheduler — log and skip.
    logger.warn("[hubspot:webhook] re-entrant tick suppressed");
    scheduleNextTick();
    return;
  }
  processorRunning = true;
  try {
    await processWebhookBatch();
  } catch (err) {
    logger.error(
      { err: (err as Error).message },
      "[hubspot:webhook] processor batch threw — will retry next tick"
    );
  } finally {
    processorRunning = false;
    scheduleNextTick();
  }
}

function scheduleNextTick(): void {
  if (processorStopRequested) return;
  processorTimeout = setTimeout(() => {
    void runBatchAndReschedule();
  }, POLL_INTERVAL_MS);
  processorTimeout.unref?.();
}

/**
 * Start the polling loop. Called from server/index.ts on boot.
 * Skipped in NODE_ENV=test so tests can drive the processor by
 * calling processWebhookBatch() directly.
 */
export function startWebhookProcessor(): void {
  if (env.NODE_ENV === "test") return;
  if (processorTimeout) return;
  processorStopRequested = false;
  logger.info(
    { pollMs: POLL_INTERVAL_MS, batchSize: BATCH_SIZE },
    "[hubspot:webhook] starting processor loop"
  );
  scheduleNextTick();
}

export function stopWebhookProcessor(): void {
  processorStopRequested = true;
  if (processorTimeout) {
    clearTimeout(processorTimeout);
    processorTimeout = null;
  }
}
