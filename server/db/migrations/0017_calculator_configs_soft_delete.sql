-- Cycle 2 (2026-06-07) — soft-delete + restore for calculator_configs,
-- bringing them to parity with documents (Phase 8 Stage 5). Mirrors
-- migration 0010 (documents soft-delete) for the calculator_configs table.
--
-- Why soft-delete (the calc DELETE used to be a HARD delete): operators
-- wanted a "Deleted" badge + restore + a HubSpot Note tear-down + an audit
-- reason — exactly like documents. Hard-delete lost all of that.
--
-- HubSpot tear-down policy mirrors documents: deleting a SYNCED config
-- HARD-deletes its HubSpot Note; a failed upstream delete leaves the row
-- ALIVE with hubspot_sync_state='delete_failed' (operator Retry).
--
-- All steps idempotent (DROP IF EXISTS / ADD COLUMN IF NOT EXISTS) so a
-- re-run on a partially-migrated DB is safe. Hand-written: drizzle-kit
-- snapshots are frozen at 0008; migrations 0009+ are authored by hand.
--> statement-breakpoint

ALTER TABLE "calculator_configs"
  ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "calculator_configs"
  ADD COLUMN IF NOT EXISTS "deleted_by_user_id" uuid;
--> statement-breakpoint
ALTER TABLE "calculator_configs"
  ADD COLUMN IF NOT EXISTS "deletion_reason" text;
--> statement-breakpoint
ALTER TABLE "calculator_configs"
  ADD COLUMN IF NOT EXISTS "deletion_note" text;
--> statement-breakpoint

-- FK on deleted_by: SET NULL on user delete so the audit chain survives
-- a user purge (display falls back to "unknown user").
ALTER TABLE "calculator_configs"
  DROP CONSTRAINT IF EXISTS "calculator_configs_deleted_by_user_id_fk";
--> statement-breakpoint
ALTER TABLE "calculator_configs" ADD CONSTRAINT "calculator_configs_deleted_by_user_id_fk"
  FOREIGN KEY ("deleted_by_user_id") REFERENCES "public"."users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint

-- Reason enum (mirrors documents). 'other' makes deletion_note required
-- at the FE/API layer; the DB CHECK only constrains the value set.
ALTER TABLE "calculator_configs"
  DROP CONSTRAINT IF EXISTS "calculator_configs_deletion_reason_check";
--> statement-breakpoint
ALTER TABLE "calculator_configs"
  ADD CONSTRAINT "calculator_configs_deletion_reason_check"
  CHECK (
    "deletion_reason" IS NULL OR
    "deletion_reason" IN ('client_request', 'created_in_error', 'replaced_by_new_version', 'duplicate', 'other')
  );
--> statement-breakpoint

-- Soft-delete invariant: deleted_at and deleted_by move together.
ALTER TABLE "calculator_configs"
  DROP CONSTRAINT IF EXISTS "calculator_configs_soft_delete_consistency_check";
--> statement-breakpoint
ALTER TABLE "calculator_configs"
  ADD CONSTRAINT "calculator_configs_soft_delete_consistency_check"
  CHECK (
    ("deleted_at" IS NULL AND "deleted_by_user_id" IS NULL)
    OR
    ("deleted_at" IS NOT NULL AND "deleted_by_user_id" IS NOT NULL)
  );
--> statement-breakpoint

-- Widen the calc hubspot_sync_state CHECK (set in 0008) to include the
-- delete_pending / delete_failed transition states used by the tear-down.
ALTER TABLE "calculator_configs"
  DROP CONSTRAINT IF EXISTS "calculator_configs_hubspot_sync_state_check";
--> statement-breakpoint
ALTER TABLE "calculator_configs"
  ADD CONSTRAINT "calculator_configs_hubspot_sync_state_check"
  CHECK ("hubspot_sync_state" IN (
    'not_synced', 'synced', 'failed', 'delete_pending', 'delete_failed'
  ));
--> statement-breakpoint

-- Widen calculator_config_events event_type so the soft-delete/restore
-- hooks can record 'deleted' + 'restored' ('sync_failed' already exists,
-- reused for a failed HubSpot tear-down stage).
ALTER TABLE "calculator_config_events"
  DROP CONSTRAINT IF EXISTS "calc_config_events_event_type_check";
--> statement-breakpoint
ALTER TABLE "calculator_config_events"
  ADD CONSTRAINT "calc_config_events_event_type_check"
  CHECK ("event_type" IN (
    'created', 'synced_to_hubspot', 'sync_failed', 'deleted', 'restored'
  ));
--> statement-breakpoint

-- admin_actions vocabulary: add 'calc.restored' (calc.deleted already
-- exists from 0014). Mirrors 0016's DROP+ADD approach.
ALTER TABLE "admin_actions"
  DROP CONSTRAINT IF EXISTS "admin_actions_action_type_check";
--> statement-breakpoint
ALTER TABLE "admin_actions"
  ADD CONSTRAINT "admin_actions_action_type_check"
  CHECK ("action_type" IN (
    'user.created', 'user.updated', 'user.password_reset',
    'user.invite_created', 'user.invite_revoked', 'user.reset_link_created',
    'auth.invite_accepted', 'auth.reset_consumed', 'auth.password_changed',
    'auth.signed_out_everywhere',
    'document.created', 'document.synced', 'document.deleted', 'document.restored',
    'calc.created', 'calc.updated', 'calc.deleted', 'calc.synced', 'calc.restored',
    'company.purged'
  ));
--> statement-breakpoint

-- Partial alive index — keeps the common alive-only list scan cheap as
-- soft-deleted rows accumulate over time.
CREATE INDEX IF NOT EXISTS "calculator_configs_alive_created_idx"
  ON "calculator_configs" USING btree ("created_at" DESC)
  WHERE "deleted_at" IS NULL;
