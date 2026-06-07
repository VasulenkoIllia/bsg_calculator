/**
 * Phase 8 Stage 4 — per-entity event logs.
 *
 * Two parallel tables (documents + calculator_configs), each with a
 * small audit trail surfaced on the corresponding detail page's
 * "History" panel.
 *
 * Design notes:
 *   - HARD foreign keys on the entity column (no polymorphic FK
 *     because Postgres doesn't support it) so a deleted entity
 *     can't leave orphan events.
 *   - `actor_user_id` FK → users with ON DELETE SET NULL: deleting
 *     a user shouldn't lose the events they triggered, but the row
 *     reads as "system" rather than holding a dangling pointer.
 *   - ON DELETE CASCADE on the entity FK. Documents now soft-delete
 *     (Stage 5: UPDATE deleted_at, not DELETE) so CASCADE never
 *     fires in normal operation — events stay alive next to the
 *     soft-deleted row. Calc-configs still hard-delete via
 *     `DELETE /calculator-configs/:id`, where CASCADE wipes the
 *     events along with the row. Sprint 9.M S3 — earlier versions
 *     of this comment said "ON DELETE RESTRICT" which contradicted
 *     the actual migration; CASCADE is now consistent across both
 *     surfaces.
 *   - `meta jsonb` is context-specific: documents 'synced_to_hubspot'
 *     carries `{noteId}`; 'sync_failed' carries `{error}`. The schema
 *     intentionally doesn't validate meta — the FE History panel
 *     reads optimistically.
 *   - Each table has its OWN event_type CHECK constraint enumerating
 *     the values valid for that entity (pdf_downloaded only makes
 *     sense for documents). Stage 5 widened documents with
 *     'deleted' / 'restored' / 'deletion_reason_edited'.
 */

import { sql } from "drizzle-orm";
import {
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";
import { documents } from "./documents";
import { calculatorConfigs } from "./calculator-configs";
import { users } from "./users";

// ────────────────────────────────────────────────────────────────────
// Document events
// ────────────────────────────────────────────────────────────────────

export const DOCUMENT_EVENT_TYPES = [
  "created",
  "pdf_downloaded",
  "synced_to_hubspot",
  "sync_failed",
  // Phase 8 Stage 5 — soft-delete + super_admin restore.
  "deleted",
  "restored",
  "deletion_reason_edited"
] as const;
export type DocumentEventType = (typeof DOCUMENT_EVENT_TYPES)[number];

export const documentEvents = pgTable(
  "document_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, {
        onDelete: "cascade",
        onUpdate: "cascade"
      }),
    eventType: text("event_type").notNull().$type<DocumentEventType>(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
      onUpdate: "cascade"
    }),
    // Default to empty object so callers can always read .meta safely.
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    docCreatedIdx: index("document_events_document_id_created_at_idx").on(
      table.documentId,
      table.createdAt
    ),
    eventTypeCheck: check(
      "document_events_event_type_check",
      sql`${table.eventType} IN ('created', 'pdf_downloaded', 'synced_to_hubspot', 'sync_failed', 'deleted', 'restored', 'deletion_reason_edited')`
    )
  })
);

export type DocumentEvent = typeof documentEvents.$inferSelect;
export type NewDocumentEvent = typeof documentEvents.$inferInsert;

// ────────────────────────────────────────────────────────────────────
// Calculator-config events
// ────────────────────────────────────────────────────────────────────

export const CALC_CONFIG_EVENT_TYPES = [
  "created",
  "synced_to_hubspot",
  "sync_failed",
  // Cycle 2 — soft-delete / restore parity with document_events.
  "deleted",
  "restored"
] as const;
export type CalcConfigEventType = (typeof CALC_CONFIG_EVENT_TYPES)[number];

export const calculatorConfigEvents = pgTable(
  "calculator_config_events",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    calculatorConfigId: uuid("calculator_config_id")
      .notNull()
      .references(() => calculatorConfigs.id, {
        onDelete: "cascade",
        onUpdate: "cascade"
      }),
    eventType: text("event_type").notNull().$type<CalcConfigEventType>(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
      onUpdate: "cascade"
    }),
    meta: jsonb("meta").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    calcCreatedIdx: index("calc_config_events_calc_id_created_at_idx").on(
      table.calculatorConfigId,
      table.createdAt
    ),
    eventTypeCheck: check(
      "calc_config_events_event_type_check",
      sql`${table.eventType} IN ('created', 'synced_to_hubspot', 'sync_failed', 'deleted', 'restored')`
    )
  })
);

export type CalculatorConfigEvent = typeof calculatorConfigEvents.$inferSelect;
export type NewCalculatorConfigEvent = typeof calculatorConfigEvents.$inferInsert;
