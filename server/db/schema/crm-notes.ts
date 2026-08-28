/**
 * `crm_notes` — ledger of every note we have ever created in a CRM.
 *
 * WHY THIS EXISTS (decision D16, docs/monday_migration_plan.md §3):
 *
 * A manual re-sync mints a NEW note each time (decision D14 — the same
 * policy HubSpot has today), but `documents.hubspot_note_id` remembers
 * only the MOST RECENT one. Deleting a document that was synced three
 * times therefore tears down one note and leaves two orphans on a live
 * client card — each carrying the document number, the company name, the
 * author's email and a link into our SPA. In HubSpot those orphans were
 * buried in an activity feed; in monday they sit on the card the sales
 * team reads every day.
 *
 * So teardown enumerates THIS table instead of trusting one mutable
 * pointer, and each row is retried independently. The pointer columns on
 * `documents` / `calculator_configs` stay exactly as they were — the UI
 * keeps reading them for the badge.
 *
 * Rows are never deleted on teardown; `tornDownAt` is stamped instead, so
 * the audit trail survives the note it describes.
 */

import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { calculatorConfigs } from "./calculator-configs";
import { documents } from "./documents";

export const crmNotes = pgTable(
  "crm_notes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    // Exactly one of these two is set (CHECK below). CASCADE because the
    // ledger is meaningless without its owner — and by the time a row is
    // hard-deleted, teardown has already run.
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "cascade",
      onUpdate: "cascade"
    }),
    calculatorConfigId: uuid("calculator_config_id").references(() => calculatorConfigs.id, {
      onDelete: "cascade",
      onUpdate: "cascade"
    }),
    // Which CRM holds it — same vocabulary as `crm_note_provider`.
    provider: text("provider").notNull().$type<"hubspot" | "monday">(),
    // The CRM's own id: a HubSpot Note id, or a monday update id.
    noteId: text("note_id").notNull(),
    // Which card it sits on, and that card's id in the CRM. Kept so
    // teardown never has to re-derive the target from current state —
    // the deal pin may have moved since the note was written.
    target: text("target").notNull().$type<"company" | "agent" | "deal">(),
    targetObjectId: text("target_object_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Stamped once the note is confirmed gone upstream.
    tornDownAt: timestamp("torn_down_at", { withTimezone: true }),
    // Last teardown failure, for the operator-facing retry.
    lastError: text("last_error")
  },
  table => ({
    // Teardown's hot path: "every note still live for this row".
    documentLiveIdx: index("crm_notes_document_live_idx")
      .on(table.documentId)
      .where(sql`torn_down_at IS NULL`),
    calcLiveIdx: index("crm_notes_calc_live_idx")
      .on(table.calculatorConfigId)
      .where(sql`torn_down_at IS NULL`),
    // A note id is unique within its CRM — makes the seeding INSERT
    // idempotent and stops a double-recorded note being torn down twice.
    providerNoteIdx: uniqueIndex("crm_notes_provider_note_idx").on(table.provider, table.noteId),
    ownerCheck: check(
      "crm_notes_owner_check",
      sql`(${table.documentId} IS NULL) <> (${table.calculatorConfigId} IS NULL)`
    ),
    providerCheck: check(
      "crm_notes_provider_check",
      sql`${table.provider} IN ('hubspot', 'monday')`
    ),
    targetCheck: check(
      "crm_notes_target_check",
      sql`${table.target} IN ('company', 'agent', 'deal')`
    )
  })
);

export type CrmNote = typeof crmNotes.$inferSelect;
export type NewCrmNote = typeof crmNotes.$inferInsert;
