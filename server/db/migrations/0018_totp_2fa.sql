-- Phase 8 Stage 2 (2026-06-08) — TOTP two-factor authentication.
--
-- Adds the per-user encrypted TOTP secret + activation timestamp to
-- `users`, plus three child tables: one-time backup codes, "trusted
-- devices" (30-day trust-this-browser), and the short-lived single-use
-- temp tokens for the two-step login. All values that are secrets are
-- stored as sha256 hashes (backup codes, trusted-device cookie token,
-- login temp token); the TOTP secret itself is AES-256-GCM-encrypted at
-- the app layer (shared/totp-crypto.ts).
--
-- All steps idempotent (ADD COLUMN IF NOT EXISTS / CREATE TABLE IF NOT
-- EXISTS / DROP CONSTRAINT IF EXISTS) so a re-run on a partially-migrated
-- DB is safe. Hand-written: drizzle-kit snapshots are frozen at 0008.
--> statement-breakpoint

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "totp_secret_encrypted" text;
--> statement-breakpoint
ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "totp_enabled_at" timestamp with time zone;
--> statement-breakpoint

-- One-time backup codes (10 per enrolment). sha256(raw); used_at marks
-- consumption. CASCADE so a user purge cleans them up.
CREATE TABLE IF NOT EXISTS "totp_backup_codes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "code_hash" text NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "totp_backup_codes"
  DROP CONSTRAINT IF EXISTS "totp_backup_codes_code_hash_unique";
--> statement-breakpoint
ALTER TABLE "totp_backup_codes"
  ADD CONSTRAINT "totp_backup_codes_code_hash_unique" UNIQUE ("code_hash");
--> statement-breakpoint
ALTER TABLE "totp_backup_codes"
  DROP CONSTRAINT IF EXISTS "totp_backup_codes_user_id_fk";
--> statement-breakpoint
ALTER TABLE "totp_backup_codes" ADD CONSTRAINT "totp_backup_codes_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "totp_backup_codes_user_id_idx"
  ON "totp_backup_codes" ("user_id");
--> statement-breakpoint

-- Trusted devices ("trust this browser 30 days"). token_hash = sha256 of
-- the signed-cookie token; fingerprint_hash = sha256(UA + first-2-IP-octets).
CREATE TABLE IF NOT EXISTS "trusted_devices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "fingerprint_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "trusted_devices"
  DROP CONSTRAINT IF EXISTS "trusted_devices_token_hash_unique";
--> statement-breakpoint
ALTER TABLE "trusted_devices"
  ADD CONSTRAINT "trusted_devices_token_hash_unique" UNIQUE ("token_hash");
--> statement-breakpoint
ALTER TABLE "trusted_devices"
  DROP CONSTRAINT IF EXISTS "trusted_devices_user_id_fk";
--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trusted_devices_user_token_idx"
  ON "trusted_devices" ("user_id","token_hash");
--> statement-breakpoint

-- Short-lived single-use login temp tokens (5-min TTL, deleted on use).
CREATE TABLE IF NOT EXISTS "mfa_temp_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "token_hash" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "mfa_temp_tokens"
  DROP CONSTRAINT IF EXISTS "mfa_temp_tokens_token_hash_unique";
--> statement-breakpoint
ALTER TABLE "mfa_temp_tokens"
  ADD CONSTRAINT "mfa_temp_tokens_token_hash_unique" UNIQUE ("token_hash");
--> statement-breakpoint
ALTER TABLE "mfa_temp_tokens"
  DROP CONSTRAINT IF EXISTS "mfa_temp_tokens_user_id_fk";
--> statement-breakpoint
ALTER TABLE "mfa_temp_tokens" ADD CONSTRAINT "mfa_temp_tokens_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mfa_temp_tokens_user_id_idx"
  ON "mfa_temp_tokens" ("user_id");
