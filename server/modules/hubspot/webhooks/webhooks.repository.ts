/**
 * `hubspot_webhook_events` DB access.
 *
 * Two halves:
 *   - INSERT path (receiver) — bulk insert with ON CONFLICT DO NOTHING.
 *     Idempotent against HubSpot's at-least-once delivery model.
 *   - PROCESSOR path (worker) — SELECT pending rows, UPDATE on complete.
 */

import { and, asc, eq, lt, sql } from "drizzle-orm";
import { db } from "../../../db/client";
import {
  hubspotWebhookEvents,
  type HubspotWebhookEvent,
  type NewHubspotWebhookEvent
} from "../../../db/schema";

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
 * `oldestProcessedBefore` is an optional cutoff used by the worker
 * to retry stuck rows: rows with `attempts > 0` but old enough that
 * the upstream error is probably transient become re-eligible after
 * the backoff window.
 */
export async function listPendingEvents(args: {
  limit: number;
  retryAfter?: Date;
}): Promise<HubspotWebhookEvent[]> {
  const cutoff = args.retryAfter ?? new Date();
  return db
    .select()
    .from(hubspotWebhookEvents)
    .where(
      and(
        eq(hubspotWebhookEvents.status, "pending"),
        // For freshly-inserted rows (`attempts = 0`) the cutoff is now
        // and they're always picked up. For retried rows, the cutoff
        // prevents thrashing the upstream on a still-failing event.
        lt(hubspotWebhookEvents.receivedAt, cutoff)
      )
    )
    .orderBy(asc(hubspotWebhookEvents.occurredAt))
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
