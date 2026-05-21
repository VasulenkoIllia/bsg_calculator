/**
 * `documents` table — frozen offer/agreement artefacts.
 *
 * Decisions:
 *   - `number TEXT UNIQUE` is the human-facing identifier
 *     (format BSG-7100024). Allocated atomically from
 *     `document_number_sequence` inside the POST transaction.
 *   - `company_id NOT NULL` + RESTRICT on company delete —
 *     legal-record artefacts must not silently vanish when ops
 *     archives a company. Operator MUST archive docs explicitly.
 *   - `hubspot_deal_id NULL` + SET NULL on deal delete —
 *     doc survives if the deal is later removed in HubSpot.
 *   - `calculator_config_id NULL` + SET NULL on config delete —
 *     informational link; doc payload already snapshots everything.
 *   - `payload JSONB` holds CalculatorSnapshotPayload + wizard
 *     meta (header / parties / signatures). Sprint 4 Q2 lock.
 *   - `scope` enum encoded as CHECK constraint, NOT a separate
 *     pg ENUM type (avoids the standard migration headache of
 *     adding new values).
 *   - `hubspot_sync_state` defaults to 'not_synced' — Phase 9
 *     write-back flips to 'synced' / 'failed' + fills note_id.
 */

import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { calculatorConfigs } from "./calculator-configs";
import { companies } from "./companies";
import { deals } from "./deals";
import { users } from "./users";

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    // Human-facing BSG-7100024 identifier. Allocated atomically via
    // `document_number_sequence` (see numbering.service.ts).
    number: text("number").notNull().unique(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    hubspotDealId: text("hubspot_deal_id").references(() => deals.hubspotDealId, {
      onDelete: "set null"
    }),
    // Informational link to the calc the doc originated from (Flow A).
    // NULL for Flow C (direct clone from another document).
    calculatorConfigId: uuid("calculator_config_id").references(
      () => calculatorConfigs.id,
      { onDelete: "set null" }
    ),
    // 'offer' | 'agreement' | 'offer_and_agreement' — enforced by CHECK below.
    // Sprint 9.M S4 — `.$type<>()` annotation narrows the column to
    // the actual enum union so callers don't need `as` casts on the
    // DTO projection. A new value would still need: (a) widening
    // this annotation, (b) widening the CHECK constraint, (c)
    // widening the matching Zod enum in documents.schemas.ts.
    scope: text("scope")
      .notNull()
      .$type<"offer" | "agreement" | "offer_and_agreement">(),
    // Frozen snapshot — CalculatorSnapshotPayload + header/parties/signatures.
    payload: jsonb("payload").notNull(),
    // Optional addendum text rendered into the PDF.
    addendum: text("addendum"),
    // 'not_synced' | 'synced' | 'failed' | 'delete_pending' | 'delete_failed'
    // — Phase 9 wrote the first three; Phase 8 Stage 5 added the last
    // two for the delete-flow transition states. Sprint 9.M S4 —
    // typed narrow so `toPublic` doesn't need an `as` cast.
    hubspotSyncState: text("hubspot_sync_state")
      .notNull()
      .default("not_synced")
      .$type<
        "not_synced" | "synced" | "failed" | "delete_pending" | "delete_failed"
      >(),
    // Set by Phase 9 once a HubSpot Note exists for this document.
    hubspotNoteId: text("hubspot_note_id"),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    // Phase 8 Stage 5 — soft-delete metadata. Null fields indicate
    // the row is alive (the migration adds a consistency CHECK so
    // these three either move together or all stay null).
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: uuid("deleted_by_user_id").references(
      () => users.id,
      { onDelete: "set null" }
    ),
    // 'client_request' | 'created_in_error' | 'replaced_by_new_version'
    // | 'duplicate' | 'other' — see migration for the CHECK enum.
    // Sprint 9.M S4 — `.$type<>()` narrows the column for `toPublic`.
    deletionReason: text("deletion_reason").$type<
      | "client_request"
      | "created_in_error"
      | "replaced_by_new_version"
      | "duplicate"
      | "other"
    >(),
    deletionNote: text("deletion_note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // `.$onUpdate` makes Drizzle stamp `updatedAt` on every UPDATE
    // statement it generates. Important for Phase 9 — the future
    // `patchSyncState` repository function will flip
    // `hubspot_sync_state` from 'not_synced' to 'synced'; without
    // this hook the column would stay at the INSERT timestamp and
    // a "last touched" sort would be meaningless.
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date())
  },
  table => ({
    // Listings filter: WHERE company_id = $1 [AND scope = $2]
    //                  ORDER BY created_at DESC
    companyCreatedIdx: index("documents_company_created_idx").on(
      table.companyId,
      table.createdAt
    ),
    // Deal-pinned docs listing on the future /companies/:id Documents tab.
    dealCreatedIdx: index("documents_deal_created_idx").on(
      table.hubspotDealId,
      table.createdAt
    ),
    // Operator dashboard: "my recent documents".
    createdByIdx: index("documents_created_by_idx").on(
      table.createdByUserId,
      table.createdAt
    ),
    // CHECK constraints are the lightest way to enforce enum values
    // without a separate pg ENUM type. Adding a new scope = single
    // ALTER TABLE … DROP CONSTRAINT + ADD CONSTRAINT.
    scopeCheck: check(
      "documents_scope_check",
      sql`${table.scope} IN ('offer', 'agreement', 'offer_and_agreement')`
    ),
    syncStateCheck: check(
      "documents_sync_state_check",
      sql`${table.hubspotSyncState} IN ('not_synced', 'synced', 'failed', 'delete_pending', 'delete_failed')`
    ),
    // Phase 8 Stage 5 — soft-delete reason enum (NULL on alive rows).
    deletionReasonCheck: check(
      "documents_deletion_reason_check",
      sql`${table.deletionReason} IS NULL OR ${table.deletionReason} IN ('client_request', 'created_in_error', 'replaced_by_new_version', 'duplicate', 'other')`
    ),
    // Phase 8 Stage 5 — soft-delete consistency: deleted_at and
    // deleted_by must both be NULL (alive) or both NON-NULL (deleted).
    softDeleteConsistencyCheck: check(
      "documents_soft_delete_consistency_check",
      sql`(${table.deletedAt} IS NULL AND ${table.deletedByUserId} IS NULL) OR (${table.deletedAt} IS NOT NULL AND ${table.deletedByUserId} IS NOT NULL)`
    ),
    // Phase 8 Stage 5 — partial index for the "alive docs only"
    // listing hot path. Cheaper than a regular index because
    // soft-deleted rows (eventually the long-tail majority) don't
    // bloat the b-tree.
    aliveCreatedIdx: index("documents_alive_created_idx")
      .on(table.createdAt)
      .where(sql`${table.deletedAt} IS NULL`),
    // Sprint 9.M S1 — composite partial index for the actually
    // most-common query: `WHERE company_id = $1 AND
    // deleted_at IS NULL ORDER BY created_at DESC`. The Stage 5
    // single-column variant above couldn't be used by the planner
    // without satisfying the company filter — this one is the
    // first-class index for the hot path.
    companyAliveCreatedIdx: index("documents_company_alive_created_idx")
      .on(table.companyId, table.createdAt)
      .where(sql`${table.deletedAt} IS NULL`)
  })
);

/**
 * Singleton sequence table for BSG-XXXXX number allocation.
 *
 * Why a table and not pg's `nextval()`? Two reasons:
 *   1. The starting value is configurable (`DOCUMENT_NUMBER_START`
 *      from env, default 7100001) per environment. Adjusting a
 *      pg sequence's starting value requires `ALTER SEQUENCE`
 *      privileges that the migration runner may not have.
 *   2. Atomic allocation inside the POST /documents transaction
 *      via `UPDATE document_number_sequence SET next_value = next_value + 1
 *      RETURNING next_value - 1` participates in the same TX as
 *      the document INSERT — if the INSERT fails for any reason
 *      (FK violation, etc.) the allocation rolls back too. With
 *      `nextval()` the sequence advances even on rollback,
 *      leaving gaps.
 *
 * The CHECK constraint pins the row to id=1 so application code
 * can always write `WHERE id = 1` without worrying about multiple
 * sequences.
 */
export const documentNumberSequence = pgTable(
  "document_number_sequence",
  {
    id: uuid("id").primaryKey().default(sql`'00000000-0000-0000-0000-000000000001'::uuid`),
    nextValue: integer("next_value").notNull()
  },
  table => ({
    singletonCheck: check(
      "document_number_sequence_singleton_check",
      sql`${table.id} = '00000000-0000-0000-0000-000000000001'::uuid`
    )
  })
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
