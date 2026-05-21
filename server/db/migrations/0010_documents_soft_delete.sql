-- Phase 8 Stage 5 (2026-05-21) — soft-delete for documents.
--
-- Soft-delete semantics chosen over hard-delete because:
--   - BSG-XXXXX numbers MUST remain reserved forever (they're
--     referenced in HubSpot's audit trail + the operator's history).
--   - The audit log (Stage 4 document_events) keeps the full chain
--     of who-did-what; hard-delete would lose context.
--   - super_admin can restore on legitimate reversal (e.g. client
--     changed mind after deletion).
--
-- HubSpot tear-down policy:
--   - When a synced document is deleted, the linked HubSpot Note is
--     HARD-deleted (DELETE /crm/v3/objects/notes/:id). The operator
--     brief calls for full cleanup — HubSpot keeps no orphan trace.
--   - If the HubSpot DELETE fails, the local row is NOT soft-deleted
--     (we set hubspot_sync_state='delete_failed' instead). Operator
--     gets a Retry button — re-runs the same flow.
--
-- All steps idempotent so a re-run on a partially-migrated DB is safe.
--> statement-breakpoint

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "deleted_by_user_id" uuid;
--> statement-breakpoint

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "deletion_reason" text;
--> statement-breakpoint

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "deletion_note" text;
--> statement-breakpoint

-- FK on deleted_by: SET NULL on user delete so audit chain survives
-- a user purge (display rendering falls back to "unknown user").
ALTER TABLE "documents"
  DROP CONSTRAINT IF EXISTS "documents_deleted_by_user_id_fk";
--> statement-breakpoint

ALTER TABLE "documents" ADD CONSTRAINT "documents_deleted_by_user_id_fk"
  FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint

-- Reason enum. 'other' makes `deletion_note` semantically required
-- (the FE form enforces it; the DB doesn't bother — the operator
-- can't reach this state via the API, and a future bulk-update
-- shouldn't be gated on a free-text note).
ALTER TABLE "documents"
  DROP CONSTRAINT IF EXISTS "documents_deletion_reason_check";
--> statement-breakpoint

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_deletion_reason_check"
  CHECK (
    "deletion_reason" IS NULL OR
    "deletion_reason" IN ('client_request', 'created_in_error', 'replaced_by_new_version', 'duplicate', 'other')
  );
--> statement-breakpoint

-- Soft-delete invariant: deleted_at and deleted_by must move together.
-- (deleted_at NULL  AND deleted_by NULL  → row is alive)
-- (deleted_at !NULL AND deleted_by !NULL → row is soft-deleted)
ALTER TABLE "documents"
  DROP CONSTRAINT IF EXISTS "documents_soft_delete_consistency_check";
--> statement-breakpoint

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_soft_delete_consistency_check"
  CHECK (
    ("deleted_at" IS NULL AND "deleted_by_user_id" IS NULL)
    OR
    ("deleted_at" IS NOT NULL AND "deleted_by_user_id" IS NOT NULL)
  );
--> statement-breakpoint

-- Widen hubspot_sync_state CHECK to include the new transition
-- states. Existing rows (only the original 3 values) stay valid.
ALTER TABLE "documents"
  DROP CONSTRAINT IF EXISTS "documents_sync_state_check";
--> statement-breakpoint

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_sync_state_check"
  CHECK ("hubspot_sync_state" IN (
    'not_synced',
    'synced',
    'failed',
    'delete_pending',
    'delete_failed'
  ));
--> statement-breakpoint

-- Partial index: most queries filter to alive docs only. Cheaper
-- than a regular index because soft-deleted rows (long-tail
-- majority over time) don't bloat the b-tree.
CREATE INDEX IF NOT EXISTS "documents_alive_created_idx"
  ON "documents" USING btree ("created_at" DESC)
  WHERE "deleted_at" IS NULL;
--> statement-breakpoint

-- Widen document_events event_type CHECK so the Stage 5 write hooks
-- can record 'deleted' and 'restored' (and the future
-- 'deletion_reason_edited' Stage 5+ might surface). 'restored' is
-- only emitted by super_admin via the restore endpoint.
ALTER TABLE "document_events"
  DROP CONSTRAINT IF EXISTS "document_events_event_type_check";
--> statement-breakpoint

ALTER TABLE "document_events"
  ADD CONSTRAINT "document_events_event_type_check"
  CHECK ("event_type" IN (
    'created',
    'pdf_downloaded',
    'synced_to_hubspot',
    'sync_failed',
    'deleted',
    'restored',
    'deletion_reason_edited'
  ));
