-- Phase 8 Stage 1 (2026-05-21): replace `users.is_admin boolean` with
-- a hierarchical `role` enum. Higher tiers inherit lower-tier
-- permissions (user ⊂ admin ⊂ super_admin), matched against the
-- new `requireRole(min)` middleware.
--
-- Migration strategy (single transaction):
--   1. ADD `role` column with DEFAULT 'user' + CHECK constraint.
--      Existing rows land at 'user' initially.
--   2. Backfill: any pre-existing `is_admin=true` row becomes
--      `role='admin'`. (The first super-admin promotion happens at
--      app startup via BOOTSTRAP_SUPER_ADMIN_EMAIL — see
--      server/scripts/bootstrap-super-admin.ts in this stage.)
--   3. DROP `is_admin`. The Drizzle schema no longer references it,
--      so leaving it would just be dead weight + confuse future
--      readers.
--
-- Safe to re-run on a partially-migrated DB: each step is idempotent
-- (`ADD COLUMN IF NOT EXISTS`, the UPDATE is a no-op if `is_admin`
-- has already been dropped, and `DROP COLUMN IF EXISTS` is a no-op
-- if the column is already gone).
--> statement-breakpoint

-- Step 1: add the role column with the CHECK constraint.
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "role" text NOT NULL DEFAULT 'user';
--> statement-breakpoint

-- Step 2: enforce the enum at the DB level. Using a NAMED constraint
-- (rather than inline) so a future migration can drop + replace it
-- cleanly when new roles are added.
ALTER TABLE "users"
  DROP CONSTRAINT IF EXISTS "users_role_check";
--> statement-breakpoint
ALTER TABLE "users"
  ADD CONSTRAINT "users_role_check"
  CHECK ("role" IN ('user', 'admin', 'super_admin'));
--> statement-breakpoint

-- Step 3: backfill from is_admin if the column still exists. The
-- DO block silently skips when is_admin is already gone (idempotent
-- on a re-run).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'is_admin'
  ) THEN
    UPDATE "users" SET "role" = 'admin' WHERE "is_admin" = true;
  END IF;
END $$;
--> statement-breakpoint

-- Step 4: drop the boolean. No code references `is_admin` after this
-- stage lands.
ALTER TABLE "users" DROP COLUMN IF EXISTS "is_admin";
