-- Sprint 9.U (2026-05-22) — Phase 8 Stage 6: admin_actions audit log.
--
-- A flat, append-only log of every privileged action super_admins (and
-- in some cases admins) perform on the system. Distinct from
-- `document_events` and `calculator_config_events` (which are
-- per-entity timelines): this table answers "what did Maria do as
-- super_admin yesterday?" rather than "what happened to document X?".
--
-- Design notes:
--   - Denormalised actor fields (display_name + email) — querying the
--     log is fast even after a user is deleted (FK uses SET NULL).
--   - `action_type` is free-form text with a CHECK for the known set.
--     Adding a new action_type is a migration; rejecting unknown
--     values keeps the controlled vocabulary honest.
--   - `target_type` + `target_id` are nullable: some actions don't
--     have a single target (e.g. global config changes — future).
--   - `meta jsonb` holds the structured payload the FE renders inline
--     (e.g. invite role, reset reason, deletion reason). Never store
--     secrets here — at least one renderer is a super_admin's screen,
--     but log aggregators may slurp this too.
--   - No revoke / soft-delete — audit logs are append-only by design.
--     Old rows can be pruned by a future cron based on created_at.

CREATE TABLE IF NOT EXISTS "admin_actions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,

  -- ─── Actor ─────────────────────────────────────────────────────────
  -- FK is SET NULL so we don't break the log when a user row is later
  -- removed (we shouldn't ever DELETE users — we have isActive=false —
  -- but the FK posture matches `document_events`).
  "actor_user_id" uuid,
  -- Denormalised so the listing endpoint doesn't need a JOIN to render
  -- "Admin (admin@bsg.test)". Captured at write-time.
  "actor_display_name" text NOT NULL,
  "actor_email" text NOT NULL,

  -- ─── Action ────────────────────────────────────────────────────────
  -- Controlled vocabulary. See the CHECK constraint below for the
  -- current set; bump migration to add new values.
  "action_type" text NOT NULL,

  -- ─── Target (nullable) ────────────────────────────────────────────
  -- 'user' / 'document' / 'calc_config' / 'invite' / 'reset' — or NULL
  -- for global actions.
  "target_type" text,
  -- Free-form id (uuid for users/configs, BSG-number for documents,
  -- token hash for invites/resets — we DON'T store the raw token).
  -- Indexed in the partial index below for the per-target query.
  "target_id" text,

  -- ─── Payload ───────────────────────────────────────────────────────
  -- Structured metadata the FE inlines (e.g. invite role, doc number,
  -- block reason). Defaults to empty object so the column is always
  -- queryable as JSON.
  "meta" jsonb DEFAULT '{}'::jsonb NOT NULL,

  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_actor_user_id_fk"
   FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id")
   ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Controlled vocabulary of action_type values. Adding a new one
-- requires a migration that drops + recreates this constraint with
-- the new value appended. Forces a deliberate decision about whether
-- a new admin surface should be audit-logged.
ALTER TABLE "admin_actions"
  DROP CONSTRAINT IF EXISTS "admin_actions_action_type_check";
--> statement-breakpoint

ALTER TABLE "admin_actions"
  ADD CONSTRAINT "admin_actions_action_type_check"
  CHECK ("action_type" IN (
    -- User management (super_admin surface)
    'user.created',           -- POST /users (direct create)
    'user.updated',           -- PATCH /users/:id (role/displayName/isActive)
    'user.password_reset',    -- POST /users/:id/password (super_admin sets directly)
    'user.invite_created',    -- POST /users/invites
    'user.invite_revoked',    -- DELETE /users/invites/:id
    'user.reset_link_created',-- POST /users/:id/password-reset-link
    -- Public flows (target user is the actor)
    'auth.invite_accepted',   -- POST /auth/invite/:token/accept
    'auth.reset_consumed',    -- POST /auth/password-reset/:token
    'auth.password_changed',  -- POST /auth/me/password (self-service)
    'auth.signed_out_everywhere', -- POST /auth/me/sign-out-everywhere
    -- Document management (admin + super_admin surface)
    'document.deleted',       -- DELETE /documents/:number (soft-delete)
    'document.restored'       -- POST /documents/:number/restore
  ));
--> statement-breakpoint

-- Hot path: the audit-log page shows newest-first with optional
-- filters (actor / action_type / target). A descending btree on
-- created_at covers the unfiltered case. Per-target lookups (e.g.
-- "every action on document BSG-7100001-XYZ") use the second index.
CREATE INDEX IF NOT EXISTS "admin_actions_created_at_idx"
  ON "admin_actions" USING btree ("created_at" DESC);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "admin_actions_target_idx"
  ON "admin_actions" USING btree ("target_type", "target_id")
  WHERE "target_id" IS NOT NULL;
