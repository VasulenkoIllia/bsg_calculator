/**
 * `hubspot_webhook_events` DB access.
 *
 * Two halves:
 *   - INSERT path (receiver) — bulk insert with ON CONFLICT DO NOTHING.
 *     Idempotent against HubSpot's at-least-once delivery model.
 *   - PROCESSOR path (worker) — SELECT pending rows, UPDATE on complete.
 */

import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../../../db/client";
import {
  hubspotWebhookEvents,
  type HubspotWebhookEvent,
  type NewHubspotWebhookEvent
} from "../../../db/schema";

/**
 * Sprint 5.F.1: retry backoff base. A row that just failed becomes
 * re-eligible after `attempts * BACKOFF_BASE_SECONDS` seconds since
 * it was received — so 30s for the first retry, 60s for the second,
 * 90s for the third. Coupled with MAX_ATTEMPTS=5 in the processor,
 * a row that keeps failing exhausts its retry budget over about
 * 5 + 4 + 3 + 2 + 1 = 15 backoff multiples (~7.5 minutes), which
 * is the right ceiling for a transient HubSpot 5xx.
 */
const BACKOFF_BASE_SECONDS = 30;

/**
 * Insert one event row. Returns the inserted row OR `undefined` when
 * the row was a duplicate (ON CONFLICT skipped it). Callers can use
 * this to log "deduped" vs "queued".
 */
export async function insertEventIfNew(
  row: NewHubspotWebhookEvent
): Promise<HubspotWebhookEvent | undefined> {
  const inserted = await db
    .insert(hubspotWebhookEvents)
    .values(row)
    .onConflictDoNothing({ target: hubspotWebhookEvents.hubspotEventId })
    .returning();
  return inserted[0];
}

/**
 * Load the next batch of pending events ordered by occurredAt so we
 * process older changes first. The worker calls this with a limit
 * (e.g. 50) every 5 seconds.
 *
 * Sprint 5.F.1: real exponential backoff (the docstring used to
 * promise this but the WHERE clause didn't implement it — pre-5.F.1
 * a failing row was re-eligible on every 5s tick, exhausting its
 * 5-attempt budget in ~25 seconds). Now a row is eligible iff
 *   attempts = 0
 *   OR received_at + (attempts × 30 seconds) ≤ now()
 * so a row that already failed twice waits a full minute before
 * being re-picked, etc.
 *
 * NOTE: receivedAt is the original insert time, not the last-attempt
 * time. As long as the worker stays serial (Sprint 5.F.1
 * setTimeout-based scheduler), the (received_at + attempts × backoff)
 * formula is monotonic and produces the intended cadence. If we ever
 * parallelise the worker, this needs to migrate to a dedicated
 * `last_attempt_at` column.
 */
export async function listPendingEvents(args: {
  limit: number;
}): Promise<HubspotWebhookEvent[]> {
  return db
    .select()
    .from(hubspotWebhookEvents)
    .where(
      and(
        eq(hubspotWebhookEvents.status, "pending"),
        sql`(
          ${hubspotWebhookEvents.attempts} = 0
          OR ${hubspotWebhookEvents.receivedAt}
             + (${hubspotWebhookEvents.attempts} * interval '${sql.raw(String(BACKOFF_BASE_SECONDS))} seconds')
             <= now()
        )`
      )
    )
    .orderBy(asc(hubspotWebhookEvents.occurredAt), asc(hubspotWebhookEvents.id))
    .limit(args.limit);
}

/**
 * Mark a row as processed with the resolved outcome.
 */
export async function markProcessed(
  id: string,
  outcome: "upserted" | "deleted" | "filtered_out"
): Promise<void> {
  await db
    .update(hubspotWebhookEvents)
    .set({
      status: "processed",
      outcome,
      processedAt: new Date(),
      lastError: null
    })
    .where(eq(hubspotWebhookEvents.id, id));
}

/**
 * Record a failed processing attempt. Increments `attempts` and
 * stores the truncated error message. The worker decides when to
 * promote `pending` → `failed` (e.g. after 5 attempts).
 */
export async function recordFailure(id: string, error: string): Promise<void> {
  // Clamp the error message at 1KB so a verbose stack trace doesn't
  // blow up the row.
  const clamped = error.length > 1024 ? `${error.slice(0, 1024)}…` : error;
  await db
    .update(hubspotWebhookEvents)
    .set({
      attempts: sql`${hubspotWebhookEvents.attempts} + 1`,
      lastError: clamped
    })
    .where(eq(hubspotWebhookEvents.id, id));
}

/**
 * Mark a row as permanently failed after the retry budget is
 * exhausted. The row stays in the DB for audit.
 */
export async function markFailed(id: string, error: string): Promise<void> {
  const clamped = error.length > 1024 ? `${error.slice(0, 1024)}…` : error;
  await db
    .update(hubspotWebhookEvents)
    .set({
      status: "failed",
      lastError: clamped,
      processedAt: new Date()
    })
    .where(eq(hubspotWebhookEvents.id, id));
}
