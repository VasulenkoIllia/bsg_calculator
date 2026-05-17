/**
 * `hubspot_webhook_events` table — inbound webhook log.
 *
 * Sprint 5 design notes:
 *   - HubSpot delivers each event 2-3 times (their docs say "at least
 *     once"). Idempotency via UNIQUE on `hubspot_event_id` plus
 *     `ON CONFLICT DO NOTHING` on the receiver makes duplicate
 *     inserts a no-op.
 *   - The receiver writes the row and returns 200 within a few ms.
 *     A worker loop (server/modules/hubspot/webhook-processor.ts)
 *     polls `status = 'pending'` rows every 5s and processes them
 *     asynchronously — keeps the webhook ack window well under
 *     HubSpot's 30s timeout.
 *   - `outcome` distinguishes ok-and-applied (`upserted` / `deleted`)
 *     from ok-but-skipped (`filtered_out` — Agent companies, etc.).
 *   - Partial index on `(status)` WHERE status = 'pending' is the
 *     worker's hot path.
 *
 * CHECK constraints encode the enums inline (same pattern as
 * `documents.scope`) so adding a new value is a single ALTER TABLE
 * rather than a pg ENUM type migration.
 */

import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";

export const hubspotWebhookEvents = pgTable(
  "hubspot_webhook_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    // HubSpot's event id. Used as the idempotency key — duplicate
    // events from HubSpot's at-least-once delivery are absorbed by
    // ON CONFLICT DO NOTHING.
    hubspotEventId: text("hubspot_event_id").notNull().unique(),
    // 'company.creation' | 'company.propertyChange' | 'company.deletion'
    // | 'deal.creation' | 'deal.propertyChange' | 'deal.deletion'
    subscriptionType: text("subscription_type").notNull(),
    // 'company' | 'deal' — derived from the subscriptionType prefix.
    objectType: text("object_type").notNull(),
    // HubSpot's id of the affected object (e.g. "426487875793").
    hubspotObjectId: text("hubspot_object_id").notNull(),
    // From event.occurredAt — the moment the change actually happened
    // in HubSpot. May lag received_at by seconds on burst events.
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // 'pending' → worker will process | 'processed' | 'failed'
    status: text("status").notNull().default("pending"),
    // Null until processed. After: 'upserted' | 'deleted' | 'filtered_out'
    outcome: text("outcome"),
    attempts: integer("attempts").notNull().default(0),
    // Last error message (clamped to a sane length at insert time).
    lastError: text("last_error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    // Full event body — kept for debugging + audit (Phase 9 may want
    // to replay events to reconstruct a state at point T).
    raw: jsonb("raw").notNull()
  },
  table => ({
    // Worker's hot path: SELECT … WHERE status = 'pending'
    // ORDER BY occurred_at LIMIT 50. Partial index is small
    // (only pending rows; processed/failed are the majority).
    pendingIdx: index("hubspot_webhook_events_pending_idx")
      .on(table.occurredAt)
      .where(sql`status = 'pending'`),
    // Operator dashboard: "recent events for company X". Cheap.
    objectIdx: index("hubspot_webhook_events_object_idx").on(
      table.objectType,
      table.hubspotObjectId,
      table.occurredAt
    ),
    statusCheck: check(
      "hubspot_webhook_events_status_check",
      sql`${table.status} IN ('pending', 'processed', 'failed')`
    ),
    outcomeCheck: check(
      "hubspot_webhook_events_outcome_check",
      sql`${table.outcome} IS NULL OR ${table.outcome} IN ('upserted', 'deleted', 'filtered_out')`
    ),
    objectTypeCheck: check(
      "hubspot_webhook_events_object_type_check",
      sql`${table.objectType} IN ('company', 'deal')`
    )
  })
);

export type HubspotWebhookEvent = typeof hubspotWebhookEvents.$inferSelect;
export type NewHubspotWebhookEvent = typeof hubspotWebhookEvents.$inferInsert;
