-- Phase 8 Stage 4 (2026-05-21) — per-entity event logs.
--
-- Two tables, one per entity (documents + calculator_configs), each
-- carrying a small audit trail used by the FE "History" panel on
-- the respective detail pages.
--
-- Why two tables instead of one polymorphic `audit_events`:
--   - We want HARD foreign keys so a deleted document/calc can't
--     leave orphan events. Polymorphic FK isn't possible at the DB
--     layer in Postgres.
--   - Each entity has its OWN enum of allowed event_type values
--     (e.g. `pdf_downloaded` only makes sense for documents). A
--     shared CHECK constraint would be a poor fit.
--   - Stage 5 will add `deleted` / `restored` to BOTH tables
--     without coupling them at the schema layer.
--
-- ON DELETE CASCADE for the entity FK (interim — see note):
--   - Today documents + calc-configs still hard-delete via DELETE
--     FROM (no soft-delete yet — that lands in Stage 5). CASCADE
--     keeps the events tree consistent with the entity tree: a
--     hard-deleted calc removes its events too.
--   - When Stage 5 introduces soft-delete (deleted_at column +
--     UPDATE instead of DELETE), the events will simply stay alive
--     alongside the soft-deleted row — no schema change needed.
--   - Flip back to RESTRICT (or NO ACTION) in Stage 5 if we want
--     a belt-and-braces guard against accidental hard-deletes.
--
-- All steps idempotent so a re-run on a partially-migrated DB is safe.
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "document_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "actor_user_id" uuid,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Drop+add so a re-run with a different ON DELETE clause replaces
-- the prior FK (otherwise the duplicate_object handler swallows the
-- ALTER and the cascade behaviour drifts from the schema file).
ALTER TABLE "document_events"
  DROP CONSTRAINT IF EXISTS "document_events_document_id_fk";
--> statement-breakpoint

ALTER TABLE "document_events" ADD CONSTRAINT "document_events_document_id_fk"
  FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "document_events" ADD CONSTRAINT "document_events_actor_user_id_fk"
   FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id")
   ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

ALTER TABLE "document_events"
  DROP CONSTRAINT IF EXISTS "document_events_event_type_check";
--> statement-breakpoint

-- Phase 8 Stage 4 event vocabulary. Stage 5 will widen this to also
-- include 'deleted' / 'restored' / 'deletion_reason_edited'.
ALTER TABLE "document_events"
  ADD CONSTRAINT "document_events_event_type_check"
  CHECK ("event_type" IN (
    'created',
    'pdf_downloaded',
    'synced_to_hubspot',
    'sync_failed'
  ));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "document_events_document_id_created_at_idx"
  ON "document_events" USING btree ("document_id", "created_at" DESC);
--> statement-breakpoint

-- ────────────────────────────────────────────────────────────────────
-- Calculator-config event log — mirrors the documents shape but with
-- a calc-specific event vocabulary. Calculators are LIVING drafts so
-- we DELIBERATELY do NOT log per-tick auto-save updates (log spam);
-- only the createdat-time + manual syncs surface.
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "calculator_config_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "calculator_config_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "actor_user_id" uuid,
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

ALTER TABLE "calculator_config_events"
  DROP CONSTRAINT IF EXISTS "calc_config_events_calc_id_fk";
--> statement-breakpoint

ALTER TABLE "calculator_config_events" ADD CONSTRAINT "calc_config_events_calc_id_fk"
  FOREIGN KEY ("calculator_config_id") REFERENCES "public"."calculator_configs"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "calculator_config_events" ADD CONSTRAINT "calc_config_events_actor_user_id_fk"
   FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id")
   ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

ALTER TABLE "calculator_config_events"
  DROP CONSTRAINT IF EXISTS "calc_config_events_event_type_check";
--> statement-breakpoint

ALTER TABLE "calculator_config_events"
  ADD CONSTRAINT "calc_config_events_event_type_check"
  CHECK ("event_type" IN (
    'created',
    'synced_to_hubspot',
    'sync_failed'
  ));
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "calc_config_events_calc_id_created_at_idx"
  ON "calculator_config_events" USING btree ("calculator_config_id", "created_at" DESC);
