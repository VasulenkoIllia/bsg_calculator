-- DOWN scripts for the monday migration (0020 + 0021 + 0022 + 0023).
--
-- Deliberately NOT inside server/db/migrations/: Drizzle scans that folder,
-- and a stray .sql there is one refactor away from being treated as a
-- migration. Referenced by docs/monday_cutover_runbook.md Stage D, whose
-- rollback rehearsal is the gate proving this whole change is reversible.
--
-- A naive "just DROP the columns" does NOT work: 0021's two foreign keys
-- depend on the unique index behind deals.crm_item_id, so order matters.
--
-- Everything here is additive-inverse only. Not one pre-existing column,
-- constraint or row is touched.
--
--   psql -U bsg -d <db> -v ON_ERROR_STOP=1 -f 0020_0023_down.sql

BEGIN;

-- ─── Refuse to run after the flip ────────────────────────────────────
-- This rollback is only safe BEFORE monday becomes the active CRM.
-- Afterwards, dropping crm_note_provider and re-applying 0020 would
-- re-stamp every monday update as a HubSpot note (0020's backfill treats a
-- NULL marker as proof of the HubSpot era), and the delete path would then
-- skip them forever — leaving live updates on customers' cards with
-- nothing recording that they exist.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM documents WHERE crm_note_provider = 'monday')
     OR EXISTS (SELECT 1 FROM calculator_configs WHERE crm_note_provider = 'monday')
  THEN
    RAISE EXCEPTION
      'Refusing to roll back: monday-era notes exist. Dropping the era marker now would relabel them as HubSpot notes and orphan them upstream. Roll back the CODE (CRM_PROVIDER=hubspot) instead, or tear those notes down first.';
  END IF;
END $$;

-- ─── 0022: webhook queue ─────────────────────────────────────────────
DROP TABLE IF EXISTS "monday_webhook_events";

-- ─── 0021: binding chain ─────────────────────────────────────────────
-- FKs first — they depend on the unique index on deals.crm_item_id.
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_crm_deal_item_id_fk";
ALTER TABLE "calculator_configs" DROP CONSTRAINT IF EXISTS "calculator_configs_crm_deal_item_id_fk";

ALTER TABLE "documents" DROP COLUMN IF EXISTS "crm_deal_item_id";
ALTER TABLE "calculator_configs" DROP COLUMN IF EXISTS "crm_deal_item_id";

DROP INDEX IF EXISTS "deals_crm_item_idx";
DROP INDEX IF EXISTS "deals_crm_company_item_idx";
ALTER TABLE "deals"
  DROP COLUMN IF EXISTS "crm_item_id",
  DROP COLUMN IF EXISTS "crm_board_id",
  DROP COLUMN IF EXISTS "crm_company_item_id",
  DROP COLUMN IF EXISTS "monday_raw",
  DROP COLUMN IF EXISTS "crm_created_at",
  DROP COLUMN IF EXISTS "crm_updated_at",
  DROP COLUMN IF EXISTS "crm_deleted_at",
  DROP COLUMN IF EXISTS "crm_missing_since";

DROP INDEX IF EXISTS "companies_crm_item_primary_idx";
DROP INDEX IF EXISTS "companies_crm_item_idx";
ALTER TABLE "companies" DROP CONSTRAINT IF EXISTS "companies_crm_binding_role_check";
ALTER TABLE "companies" DROP CONSTRAINT IF EXISTS "companies_crm_deleted_reason_check";
ALTER TABLE "companies"
  DROP COLUMN IF EXISTS "crm_item_id",
  DROP COLUMN IF EXISTS "crm_board_id",
  DROP COLUMN IF EXISTS "crm_binding_role",
  DROP COLUMN IF EXISTS "monday_raw",
  DROP COLUMN IF EXISTS "crm_created_at",
  DROP COLUMN IF EXISTS "crm_updated_at",
  DROP COLUMN IF EXISTS "crm_deleted_at",
  DROP COLUMN IF EXISTS "crm_deleted_reason",
  DROP COLUMN IF EXISTS "crm_missing_since",
  DROP COLUMN IF EXISTS "legacy_hubspot_name";

DROP TABLE IF EXISTS "crm_id_map";

-- ─── 0023: rollback guard ────────────────────────────────────────────
-- Must go before 0020's columns: the trigger function references them.
DROP TRIGGER IF EXISTS "documents_crm_note_provider_backfill" ON "documents";
DROP TRIGGER IF EXISTS "calculator_configs_crm_note_provider_backfill" ON "calculator_configs";
DROP FUNCTION IF EXISTS crm_note_provider_backfill();

-- ─── 0020: era marker + note ledger ──────────────────────────────────
DROP TABLE IF EXISTS "crm_notes";

ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_crm_note_pairing_check";
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_crm_note_target_check";
ALTER TABLE "calculator_configs" DROP CONSTRAINT IF EXISTS "calculator_configs_crm_note_pairing_check";
ALTER TABLE "calculator_configs" DROP CONSTRAINT IF EXISTS "calculator_configs_crm_note_target_check";

ALTER TABLE "documents"
  DROP COLUMN IF EXISTS "crm_note_provider",
  DROP COLUMN IF EXISTS "crm_note_target",
  DROP COLUMN IF EXISTS "legacy_hubspot_note_id";
ALTER TABLE "calculator_configs"
  DROP COLUMN IF EXISTS "crm_note_provider",
  DROP COLUMN IF EXISTS "crm_note_target",
  DROP COLUMN IF EXISTS "legacy_hubspot_note_id";

-- ─── The step a DROP-only rollback forgets ───────────────────────────
-- Drizzle gates on its own bookkeeping table. If these rows survive, the
-- migrator believes 0020-0022 already ran and `npm run db:migrate` will
-- NOT re-apply them — leaving a schema and a migration history that
-- disagree, which is far harder to diagnose than a missing column.
-- Match by the EXACT journal timestamps of our four migrations, never by
-- "the three most recent". A rehearsal on a database where these were
-- applied straight through psql (so Drizzle never recorded them) deleted
-- three legitimate pre-existing rows instead — 0017, 0018 and 0019 — and
-- the only visible symptom was a row count. `created_at` here is the
-- `when` field from meta/_journal.json.
DELETE FROM drizzle."__drizzle_migrations"
 WHERE created_at IN (1780441200000, 1780527600000, 1780614000000, 1780700400000);

COMMIT;
