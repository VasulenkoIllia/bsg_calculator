-- Phase 9.I (2026-05-21) — add HubSpot sync state to calculator_configs.
--
-- Background: documents already have these two columns (hubspot_note_id,
-- hubspot_sync_state) since Phase 8 schema. The operator brief asks
-- for the SAME write-back capability on calc-configs:
--   - create a HubSpot Note when the calc is first saved
--   - DO NOT update the Note on every auto-save (the link in the
--     Note opens our SPA, which always renders the freshest state)
--   - keep the noteId so a future Stage 5 calc-deletion can DELETE
--     the linked Note via hubspot.client.deleteNote()
--
-- Schema mirror of documents.{hubspot_note_id, hubspot_sync_state}:
--   - hubspot_note_id: text NULL (NULL when not synced or deletion
--     wiped the upstream ref)
--   - hubspot_sync_state: text NOT NULL DEFAULT 'not_synced' CHECK in
--     ('not_synced', 'synced', 'failed')
--
-- All steps idempotent so a re-run on a partially-migrated DB is safe.
--> statement-breakpoint

ALTER TABLE "calculator_configs"
  ADD COLUMN IF NOT EXISTS "hubspot_note_id" text;
--> statement-breakpoint

ALTER TABLE "calculator_configs"
  ADD COLUMN IF NOT EXISTS "hubspot_sync_state" text NOT NULL DEFAULT 'not_synced';
--> statement-breakpoint

ALTER TABLE "calculator_configs"
  DROP CONSTRAINT IF EXISTS "calculator_configs_hubspot_sync_state_check";
--> statement-breakpoint

ALTER TABLE "calculator_configs"
  ADD CONSTRAINT "calculator_configs_hubspot_sync_state_check"
  CHECK ("hubspot_sync_state" IN ('not_synced', 'synced', 'failed'));
