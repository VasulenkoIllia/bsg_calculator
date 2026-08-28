-- monday migration, step 2 — parallel binding chain (2026-08-27).
--
-- ADDITIVE ONLY. Not one existing column is renamed, re-typed or re-keyed.
-- The HubSpot chain (companies.hubspot_company_id -> deals.hubspot_company_id
-- -> documents.hubspot_deal_id) stays exactly as it is and keeps working
-- until CRM_PROVIDER flips; these columns run alongside it.
--
-- WHY NOT RE-KEY IN PLACE: `documents_hubspot_deal_id_deals_hubspot_deal_id_fk`
-- and its calculator_configs twin are ON UPDATE NO ACTION and NOT deferrable
-- (verified with pg_constraint on the restored prod copy). An
-- `UPDATE deals SET hubspot_deal_id = <monday id>` therefore hard-fails with
-- 23503 on the 8 deal-pinned documents and 4 calc-configs, and
-- SET CONSTRAINTS DEFERRED cannot help because the constraints are not
-- declared deferrable. Parallel columns are the only reversible option.
--> statement-breakpoint

-- ─── companies ───────────────────────────────────────────────────────
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "crm_item_id" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "crm_board_id" text;
--> statement-breakpoint
-- 'primary' = the row the UI should surface for this monday item.
-- 'alias'   = a duplicate of ours pointing at the same item. Eight such
--             pairs exist today (HubSpot duplicates the operator merged
--             into one card in monday). Aliases keep their documents and
--             stay queryable; they are simply not the canonical row.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "crm_binding_role" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "monday_raw" jsonb;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "crm_created_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "crm_updated_at" timestamptz;
--> statement-breakpoint
-- Set ONLY by an explicit item_deleted / item_archived event.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "crm_deleted_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "crm_deleted_reason" text;
--> statement-breakpoint
-- Set by the BACKFILL when a bound row is absent from its board. This is
-- an OBSERVATION, never an authorisation: absence can also mean a paging
-- glitch, a permission change, or a backfill that ran before the remap.
-- It drives a badge and an ops alert and nothing else — in particular it
-- must NEVER unlock the purge button. That is what crm_deleted_at is for.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "crm_missing_since" timestamptz;
--> statement-breakpoint
-- The pre-migration name, preserved before the first monday sync renames
-- 71 of 76 companies (the "(M) " / "(A) " prefixes do not exist in monday).
-- Without it the matcher's own input is destroyed and a mis-bind becomes
-- invisible to a human reviewer.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "legacy_hubspot_name" text;
--> statement-breakpoint

ALTER TABLE "companies" DROP CONSTRAINT IF EXISTS "companies_crm_binding_role_check";
--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_crm_binding_role_check" CHECK (
  "crm_binding_role" IS NULL OR "crm_binding_role" IN ('primary', 'alias')
);
--> statement-breakpoint
ALTER TABLE "companies" DROP CONSTRAINT IF EXISTS "companies_crm_deleted_reason_check";
--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_crm_deleted_reason_check" CHECK (
  "crm_deleted_reason" IS NULL OR "crm_deleted_reason" IN ('deleted', 'archived')
);
--> statement-breakpoint

-- NOT a plain UNIQUE: eight monday items are each claimed by TWO of our
-- rows. Uniqueness holds only among the canonical ones.
CREATE UNIQUE INDEX IF NOT EXISTS "companies_crm_item_primary_idx"
  ON "companies" ("crm_item_id")
  WHERE "crm_item_id" IS NOT NULL AND "crm_binding_role" = 'primary';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_crm_item_idx" ON "companies" ("crm_item_id");
--> statement-breakpoint

-- ─── deals ───────────────────────────────────────────────────────────
-- A real UNIQUE is safe here: all 28 deals map 1:1 with no collisions,
-- and UNIQUE permits many NULLs during the transition.
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "crm_item_id" text;
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "crm_board_id" text;
--> statement-breakpoint
-- The monday item id of the parent company. A plain indexed column, NOT a
-- foreign key: companies.crm_item_id cannot be a FK target because its
-- uniqueness is partial (see above).
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "crm_company_item_id" text;
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "monday_raw" jsonb;
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "crm_created_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "crm_updated_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "crm_deleted_at" timestamptz;
--> statement-breakpoint
ALTER TABLE "deals" ADD COLUMN IF NOT EXISTS "crm_missing_since" timestamptz;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "deals_crm_item_idx" ON "deals" ("crm_item_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deals_crm_company_item_idx" ON "deals" ("crm_company_item_id");
--> statement-breakpoint

-- ─── documents + calculator_configs: the monday-side deal pin ─────────
-- Born ON UPDATE CASCADE so any future re-bind is a single UPDATE rather
-- than the FK surgery the HubSpot columns would have needed.
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "crm_deal_item_id" text;
--> statement-breakpoint
ALTER TABLE "calculator_configs" ADD COLUMN IF NOT EXISTS "crm_deal_item_id" text;
--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT IF EXISTS "documents_crm_deal_item_id_fk";
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_crm_deal_item_id_fk"
  FOREIGN KEY ("crm_deal_item_id") REFERENCES "deals"("crm_item_id")
  ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint
ALTER TABLE "calculator_configs" DROP CONSTRAINT IF EXISTS "calculator_configs_crm_deal_item_id_fk";
--> statement-breakpoint
ALTER TABLE "calculator_configs" ADD CONSTRAINT "calculator_configs_crm_deal_item_id_fk"
  FOREIGN KEY ("crm_deal_item_id") REFERENCES "deals"("crm_item_id")
  ON DELETE SET NULL ON UPDATE CASCADE;
--> statement-breakpoint

-- ─── crm_id_map: the audit record of the remap ───────────────────────
-- Kept forever. It is the only place that records HOW each binding was
-- decided, which is what makes a mis-bind reviewable after the fact.
CREATE TABLE IF NOT EXISTS "crm_id_map" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "object_type" text NOT NULL,
  "hubspot_id" text NOT NULL,
  "crm_item_id" text NOT NULL,
  "crm_board_id" text,
  -- 'hubspot_id' | 'name_strict' | 'name_exact' | 'name_loose' | 'order_reference_number' | 'manual'
  "matched_by" text NOT NULL,
  "binding_role" text,
  "local_id" uuid,
  "applied_at" timestamptz NOT NULL DEFAULT now(),
  "notes" text,
  CONSTRAINT "crm_id_map_object_type_check" CHECK ("object_type" IN ('company', 'deal')),
  CONSTRAINT "crm_id_map_binding_role_check" CHECK (
    "binding_role" IS NULL OR "binding_role" IN ('primary', 'alias')
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "crm_id_map_object_hubspot_idx"
  ON "crm_id_map" ("object_type", "hubspot_id");
