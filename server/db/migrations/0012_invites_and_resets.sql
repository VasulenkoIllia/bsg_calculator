-- Sprint 9.O (2026-05-21) — invite-link + password-reset-link flows.
--
-- Operator brief: super_admin should NOT type in the new user's
-- email/password directly (Stage 3 shipped that as a stopgap).
-- Instead super_admin generates a one-time link that the invitee
-- (or to-be-reset user) opens to set their own credentials.
--
-- Two new tables, both single-use opaque tokens:
--
--   user_invites    — pre-filled with role only; invitee enters
--                     email + login + display_name + password on
--                     /accept-invite. Token is sha256-hashed at
--                     rest; the raw token is returned ONCE to the
--                     super_admin via the create response and
--                     never persisted.
--
--   password_resets — pre-bound to a specific existing user_id;
--                     the user enters only the new password on
--                     /reset-password. Same hashing pattern.
--
-- Both tables track creator (super_admin who issued the link), TTL
-- via expires_at, accepted/used timestamp, and revoke timestamp.
-- The "Cleanup expired" job is intentionally NOT migrated — old
-- rows are operationally harmless (token_hash UNIQUE constraint
-- prevents reuse). A future cron can purge accepted_at + used_at
-- older than 90 days.
--
-- All steps idempotent so a re-run on a partially-migrated DB is safe.
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "user_invites" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  -- The role the invitee will be granted on accept. The CHECK below
  -- pins to the same values as users.role for consistency.
  "role" text NOT NULL,
  -- sha256(raw_token). The raw is returned ONCE in the create
  -- response, never persisted. UNIQUE so an unlikely hash collision
  -- still fails loud rather than letting two invites share a token.
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "accepted_at" timestamp with time zone,
  -- Sprint 9.O — populated when the invitee successfully accepts
  -- so /admin/users can show the resulting user inline + super_admin
  -- can trace "this invite → that user" for audit.
  "accepted_user_id" uuid,
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_token_hash_unique" UNIQUE ("token_hash");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

ALTER TABLE "user_invites"
  DROP CONSTRAINT IF EXISTS "user_invites_role_check";
--> statement-breakpoint

ALTER TABLE "user_invites"
  ADD CONSTRAINT "user_invites_role_check"
  CHECK ("role" IN ('user', 'admin', 'super_admin'));
--> statement-breakpoint

-- Lifecycle consistency: accepted_at + accepted_user_id move together
-- (both NULL = pending; both NON-NULL = accepted). Belt-and-braces
-- against a service bug that sets one without the other.
ALTER TABLE "user_invites"
  DROP CONSTRAINT IF EXISTS "user_invites_acceptance_check";
--> statement-breakpoint

ALTER TABLE "user_invites"
  ADD CONSTRAINT "user_invites_acceptance_check"
  CHECK (
    ("accepted_at" IS NULL AND "accepted_user_id" IS NULL)
    OR
    ("accepted_at" IS NOT NULL AND "accepted_user_id" IS NOT NULL)
  );
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_created_by_user_id_fk"
   FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id")
   ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "user_invites" ADD CONSTRAINT "user_invites_accepted_user_id_fk"
   FOREIGN KEY ("accepted_user_id") REFERENCES "public"."users"("id")
   ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Hot path: super_admin's "list pending invites" view filters out
-- accepted + revoked + expired. Partial index keeps the scan cheap
-- as the table grows over time (accepted invites accumulate forever).
CREATE INDEX IF NOT EXISTS "user_invites_pending_idx"
  ON "user_invites" USING btree ("created_at" DESC)
  WHERE "accepted_at" IS NULL AND "revoked_at" IS NULL;
--> statement-breakpoint

-- ────────────────────────────────────────────────────────────────────
-- Password-reset tokens — bound to an existing user.
-- ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "password_resets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  -- Single-use: once set, the token can't be re-used.
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_token_hash_unique" UNIQUE ("token_hash");
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_user_id_fk"
   FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
   ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

DO $$ BEGIN
 ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_created_by_user_id_fk"
   FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id")
   ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- Partial index for "active (unused, unexpired) reset tokens for
-- user X" — the only realistic query pattern. Pruning accepted +
-- expired keeps the planner's scan tight.
CREATE INDEX IF NOT EXISTS "password_resets_active_idx"
  ON "password_resets" USING btree ("user_id", "expires_at" DESC)
  WHERE "used_at" IS NULL;
