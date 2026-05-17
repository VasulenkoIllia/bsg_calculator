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

import { eq } from "drizzle-orm";
import { db } from "../../../db/client";
import { companies, deals, type HubspotWebhookEvent } from "../../../db/schema";
import { env } from "../../../config/env";
import { logger } from "../../../middleware/logger";
import { HubspotUnreachableError, NotFoundError } from "../../../shared/errors";
import { hubspot } from "../hubspot.client";
import { mapHubspotCompanyToRow, mapHubspotDealToRow } from "../hubspot.mapper";
import { upsertCompany } from "../../companies/companies.repository";
import { upsertDeal } from "../../deals/deals.repository";
import {
  listPendingEvents,
  markFailed,
  markProcessed,
  recordFailure
} from "./webhooks.repository";

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
  if (subType.endsWith(".deletion")) {
    if (isCompany) {
      // Deals first via FK CASCADE (the FK is RESTRICT in our schema,
      // so we need explicit deal deletion first to avoid FK errors
      // when the company's last deal is still around).
      await db
        .delete(deals)
        .where(eq(deals.hubspotCompanyId, event.hubspotObjectId));
      await db
        .delete(companies)
        .where(eq(companies.hubspotCompanyId, event.hubspotObjectId));
    } else {
      await db.delete(deals).where(eq(deals.hubspotDealId, event.hubspotObjectId));
    }
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
      // Deal upsert requires the parent company to be in our cache.
      // If it isn't, skip the deal — the next company event for it
      // (or a manual refresh) will reconcile.
      const parent = await db
        .select({ id: companies.hubspotCompanyId })
        .from(companies)
        .where(eq(companies.hubspotCompanyId, row.hubspotCompanyId))
        .limit(1);
      if (parent.length === 0) {
        return "filtered_out";
      }
      await upsertDeal(row);
      return "upserted";
    }
  } catch (err) {
    // HubSpot 404 on a creation/propertyChange event means HubSpot
    // already deleted the object before we got around to fetching
    // it (race). Treat it as a delete.
    if (err instanceof NotFoundError) {
      if (isCompany) {
        await db
          .delete(deals)
          .where(eq(deals.hubspotCompanyId, event.hubspotObjectId));
        await db
          .delete(companies)
          .where(eq(companies.hubspotCompanyId, event.hubspotObjectId));
      } else {
        await db.delete(deals).where(eq(deals.hubspotDealId, event.hubspotObjectId));
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
  for (const event of events) {
    try {
      const outcome = await processOne(event);
      await markProcessed(event.id, outcome);
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
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

let processorInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start the polling loop. Called from server/index.ts on boot.
 * Skipped in NODE_ENV=test so tests can drive the processor by
 * calling processWebhookBatch() directly.
 */
export function startWebhookProcessor(): void {
  if (env.NODE_ENV === "test") return;
  if (processorInterval) return;
  logger.info({ pollMs: POLL_INTERVAL_MS, batchSize: BATCH_SIZE }, "[hubspot:webhook] starting processor loop");
  processorInterval = setInterval(() => {
    void processWebhookBatch().catch(err => {
      logger.error(
        { err: (err as Error).message },
        "[hubspot:webhook] processor batch threw — will retry next tick"
      );
    });
  }, POLL_INTERVAL_MS);
  // Don't keep the event loop alive just for this — when the server
  // shuts down via SIGTERM the interval is cleared anyway.
  processorInterval.unref?.();
}

export function stopWebhookProcessor(): void {
  if (processorInterval) {
    clearInterval(processorInterval);
    processorInterval = null;
  }
}
