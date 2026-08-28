/**
 * `monday_webhook_events` — inbound delivery queue.
 *
 * Mirrors the HubSpot queue's proven shape (receive fast, ACK, process on
 * a poll loop with a retry budget) but keeps its own table: monday sends
 * no unique event id and identifies objects by (boardId, pulseId), so the
 * two payloads share no columns worth unifying.
 */

import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const mondayWebhookEvents = pgTable(
  "monday_webhook_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    /**
     * Synthetic idempotency key — md5(board:item:type:triggerTime).
     * monday retries the identical payload every minute for 30 minutes
     * and supplies nothing unique of its own, so the key has to come from
     * the content. See the migration for why a collision is harmless.
     */
    eventKey: text("event_key").notNull().unique(),
    eventType: text("event_type").notNull(),
    boardId: text("board_id").notNull(),
    itemId: text("item_id").notNull(),
    objectType: text("object_type").notNull().$type<"company" | "agent" | "deal">(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    status: text("status").notNull().default("pending").$type<"pending" | "processed" | "failed">(),
    outcome: text("outcome").$type<"upserted" | "flagged_deleted" | "restored" | "skipped" | null>(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    /** Debug only — never a data source. Every field is re-read from the API. */
    raw: jsonb("raw").notNull()
  },
  table => ({
    pendingIdx: index("monday_webhook_events_pending_idx")
      .on(table.occurredAt, table.receivedAt, table.attempts)
      .where(sql`status = 'pending'`),
    itemIdx: index("monday_webhook_events_item_idx").on(
      table.objectType,
      table.itemId,
      table.occurredAt
    ),
    statusCheck: check(
      "monday_webhook_events_status_check",
      sql`${table.status} IN ('pending', 'processed', 'failed')`
    ),
    outcomeCheck: check(
      "monday_webhook_events_outcome_check",
      sql`${table.outcome} IS NULL OR ${table.outcome} IN ('upserted', 'flagged_deleted', 'restored', 'skipped')`
    ),
    objectTypeCheck: check(
      "monday_webhook_events_object_type_check",
      sql`${table.objectType} IN ('company', 'agent', 'deal')`
    )
  })
);

export type MondayWebhookEvent = typeof mondayWebhookEvents.$inferSelect;
export type NewMondayWebhookEvent = typeof mondayWebhookEvents.$inferInsert;
