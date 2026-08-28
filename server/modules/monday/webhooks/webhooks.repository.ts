/** Queue access for the monday webhook events table. */

import { and, asc, eq, lte, sql } from "drizzle-orm";
import { db } from "../../../db/client";
import {
  mondayWebhookEvents,
  type MondayWebhookEvent,
  type NewMondayWebhookEvent
} from "../../../db/schema";

/** Insert unless the synthetic key was already seen. Returns false on a duplicate. */
export async function insertMondayEventIfNew(row: NewMondayWebhookEvent): Promise<boolean> {
  const result = await db
    .insert(mondayWebhookEvents)
    .values(row)
    .onConflictDoNothing({ target: mondayWebhookEvents.eventKey })
    .returning({ id: mondayWebhookEvents.id });
  return result.length > 0;
}

/**
 * Next batch to process: pending, past its backoff window, oldest first.
 * Backoff is 30s × attempts, matching the HubSpot processor's cadence.
 */
export async function listPendingMondayEvents(limit = 50): Promise<MondayWebhookEvent[]> {
  return db
    .select()
    .from(mondayWebhookEvents)
    .where(
      and(
        eq(mondayWebhookEvents.status, "pending"),
        lte(
          sql`${mondayWebhookEvents.receivedAt} + (${mondayWebhookEvents.attempts} * interval '30 seconds')`,
          sql`now()`
        )
      )
    )
    .orderBy(asc(mondayWebhookEvents.occurredAt), asc(mondayWebhookEvents.id))
    .limit(limit);
}

export async function markMondayEventProcessed(
  id: string,
  outcome: "upserted" | "flagged_deleted" | "restored" | "skipped"
): Promise<void> {
  await db
    .update(mondayWebhookEvents)
    .set({ status: "processed", outcome, processedAt: new Date(), lastError: null })
    .where(eq(mondayWebhookEvents.id, id));
}

export async function recordMondayEventFailure(id: string, message: string): Promise<void> {
  await db
    .update(mondayWebhookEvents)
    .set({ attempts: sql`${mondayWebhookEvents.attempts} + 1`, lastError: message.slice(0, 500) })
    .where(eq(mondayWebhookEvents.id, id));
}

export async function markMondayEventFailed(id: string, message: string): Promise<void> {
  await db
    .update(mondayWebhookEvents)
    .set({
      status: "failed",
      attempts: sql`${mondayWebhookEvents.attempts} + 1`,
      lastError: message.slice(0, 500),
      processedAt: new Date()
    })
    .where(eq(mondayWebhookEvents.id, id));
}
