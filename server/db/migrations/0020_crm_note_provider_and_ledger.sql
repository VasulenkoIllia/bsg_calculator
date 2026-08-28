-- monday migration, step 1 of N (2026-08-27) — CRM provider marker + note ledger.
--
-- ADDITIVE ONLY. Nothing is renamed, nothing is re-keyed, no existing
-- column changes type or nullability. Every statement is reversible by a
-- DROP, and with CRM_PROVIDER defaulting to 'hubspot' the deployed
-- behaviour is byte-identical to before this migration.
--
-- WHY (docs/monday_migration_plan.md §3):
--   `hubspot_note_id` alone cannot answer "which CRM holds the artifact I
--   must tear down when this row is deleted?". After HubSpot is switched
--   off (2026-08-31) the delete path would either refuse to delete
--   (ValidationError, token unconfigured) or wedge on `delete_failed`.
--   `crm_note_provider` answers it per-row, and the teardown predicate
--   becomes `crm_note_provider = env.CRM_PROVIDER`.
--
--   The marker is MUTABLE by design: a HubSpot-era row later re-synced to
--   monday must flip, or teardown would target a dead system forever.
--
-- `hubspot_note_id` KEEPS ITS NAME on purpose. Five frontend sort-field
-- unions mirror these column names as bare strings with no compile-time
-- link; renaming would produce a runtime 400 with a green build.
--> statement-breakpoint

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "crm_note_provider" text;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "crm_note_target" text;
--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "legacy_hubspot_note_id" text;
--> statement-breakpoint
ALTER TABLE "calculator_configs" ADD COLUMN IF NOT EXISTS "crm_note_provider" text;
--> statement-breakpoint
ALTER TABLE "calculator_configs" ADD COLUMN IF NOT EXISTS "crm_note_target" text;
--> statement-breakpoint
ALTER TABLE "calculator_configs" ADD COLUMN IF NOT EXISTS "legacy_hubspot_note_id" text;
--> statement-breakpoint

-- Backfill: every row that already carries a note id got it from HubSpot.
-- Expected on prod as of 2026-08-27: 34 documents, 3 calculator_configs.
UPDATE "documents"
   SET "crm_note_provider" = 'hubspot',
       "crm_note_target"   = CASE WHEN "hubspot_deal_id" IS NOT NULL THEN 'deal' ELSE 'company' END
 WHERE "hubspot_note_id" IS NOT NULL
   AND "crm_note_provider" IS NULL;
--> statement-breakpoint
UPDATE "calculator_configs"
   SET "crm_note_provider" = 'hubspot',
       "crm_note_target"   = CASE WHEN "hubspot_deal_id" IS NOT NULL THEN 'deal' ELSE 'company' END
 WHERE "hubspot_note_id" IS NOT NULL
   AND "crm_note_provider" IS NULL;
--> statement-breakpoint

-- Pairing invariant: the provider is set if and only if a note id is.
-- soft-delete / restore null the note id, so they MUST null these two in
-- the same statement or the restore is rejected here.
--
-- The explicit `IS NOT NULL` before the IN list is load-bearing and NOT
-- redundant: with a NULL provider, `NULL IN ('hubspot','monday')` evaluates
-- to NULL, not false, and a CHECK whose expression is NULL is treated as
-- SATISFIED. Without it the constraint silently permits exactly the state
-- it exists to forbid — a note id with no provider, i.e. a row whose
-- teardown target is unknowable. Caught by the constraint tests on the
-- restored prod copy, 2026-08-27.
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_crm_note_pairing_check";
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_crm_note_pairing_check" CHECK (
  ("hubspot_note_id" IS NULL     AND "crm_note_provider" IS NULL) OR
  ("hubspot_note_id" IS NOT NULL AND "crm_note_provider" IS NOT NULL
                                 AND "crm_note_provider" IN ('hubspot', 'monday'))
);
--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_crm_note_target_check";
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_crm_note_target_check" CHECK (
  "crm_note_target" IS NULL OR "crm_note_target" IN ('company', 'agent', 'deal')
);
--> statement-breakpoint
ALTER TABLE "calculator_configs" DROP CONSTRAINT IF EXISTS "calculator_configs_crm_note_pairing_check";
--> statement-breakpoint
ALTER TABLE "calculator_configs" ADD CONSTRAINT "calculator_configs_crm_note_pairing_check" CHECK (
  ("hubspot_note_id" IS NULL     AND "crm_note_provider" IS NULL) OR
  ("hubspot_note_id" IS NOT NULL AND "crm_note_provider" IS NOT NULL
                                 AND "crm_note_provider" IN ('hubspot', 'monday'))
);
--> statement-breakpoint
ALTER TABLE "calculator_configs" DROP CONSTRAINT IF EXISTS "calculator_configs_crm_note_target_check";
--> statement-breakpoint
ALTER TABLE "calculator_configs" ADD CONSTRAINT "calculator_configs_crm_note_target_check" CHECK (
  "crm_note_target" IS NULL OR "crm_note_target" IN ('company', 'agent', 'deal')
);
--> statement-breakpoint

-- ─── Note ledger (decision D16) ──────────────────────────────────────
--
-- A manual re-sync mints a NEW note (D14, same policy as HubSpot today),
-- but `hubspot_note_id` remembers only the most recent one. Deleting a
-- document synced three times would tear down one note and leave two
-- orphans on a live client card, each carrying the document number,
-- company name, author email and a link into our SPA.
--
-- The ledger records EVERY note ever created for a row, so teardown
-- enumerates rows instead of trusting one mutable pointer. The pointer
-- columns stay exactly as they are — the UI keeps reading them.
CREATE TABLE IF NOT EXISTS "crm_notes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "document_id" uuid REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "calculator_config_id" uuid REFERENCES "calculator_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  -- Which CRM holds this note. Same vocabulary as crm_note_provider.
  "provider" text NOT NULL,
  -- The CRM's own id: a HubSpot Note id, or a monday update id.
  "note_id" text NOT NULL,
  -- Which card it sits on, and that card's id in the CRM.
  "target" text NOT NULL,
  "target_object_id" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  -- Set once the note has been successfully torn down upstream. Rows are
  -- kept (not deleted) so the audit trail survives.
  "torn_down_at" timestamptz,
  "last_error" text,
  CONSTRAINT "crm_notes_owner_check" CHECK (
    ("document_id" IS NULL) <> ("calculator_config_id" IS NULL)
  ),
  CONSTRAINT "crm_notes_provider_check" CHECK ("provider" IN ('hubspot', 'monday')),
  CONSTRAINT "crm_notes_target_check" CHECK ("target" IN ('company', 'agent', 'deal'))
);
--> statement-breakpoint

-- Teardown's hot path: "every note still live for this row".
CREATE INDEX IF NOT EXISTS "crm_notes_document_live_idx"
  ON "crm_notes" ("document_id") WHERE "torn_down_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "crm_notes_calc_live_idx"
  ON "crm_notes" ("calculator_config_id") WHERE "torn_down_at" IS NULL;
--> statement-breakpoint
-- Same note id must not be recorded twice for the same provider.
CREATE UNIQUE INDEX IF NOT EXISTS "crm_notes_provider_note_idx"
  ON "crm_notes" ("provider", "note_id");
--> statement-breakpoint

-- Seed the ledger from the notes that already exist, so teardown covers
-- them from day one. Only the CURRENT pointer is known — notes minted by
-- earlier re-syncs were never recorded anywhere and are unrecoverable
-- (documented as an accepted risk in the migration plan).
INSERT INTO "crm_notes" ("document_id", "provider", "note_id", "target", "target_object_id")
SELECT d."id",
       'hubspot',
       d."hubspot_note_id",
       CASE WHEN d."hubspot_deal_id" IS NOT NULL THEN 'deal' ELSE 'company' END,
       COALESCE(d."hubspot_deal_id", c."hubspot_company_id")
  FROM "documents" d
  JOIN "companies" c ON c."id" = d."company_id"
 WHERE d."hubspot_note_id" IS NOT NULL
ON CONFLICT ("provider", "note_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "crm_notes" ("calculator_config_id", "provider", "note_id", "target", "target_object_id")
SELECT k."id",
       'hubspot',
       k."hubspot_note_id",
       CASE WHEN k."hubspot_deal_id" IS NOT NULL THEN 'deal' ELSE 'company' END,
       COALESCE(k."hubspot_deal_id", c."hubspot_company_id")
  FROM "calculator_configs" k
  JOIN "companies" c ON c."id" = k."company_id"
 WHERE k."hubspot_note_id" IS NOT NULL
ON CONFLICT ("provider", "note_id") DO NOTHING;
