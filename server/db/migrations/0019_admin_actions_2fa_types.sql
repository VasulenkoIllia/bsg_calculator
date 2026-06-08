-- Phase 8 Stage 2 (2026-06-08) — widen the admin_actions action_type
-- CHECK with the three 2FA lifecycle events:
--   auth.2fa_enabled        — a user confirmed 2FA enrolment (self-service)
--   auth.2fa_disabled       — a user disabled their own 2FA (re-auth)
--   user.force_disabled_2fa — a super-admin force-disabled a user's 2FA
--
-- DROP + ADD with the full superset of every value that any prior
-- migration could have written, so ADD CONSTRAINT cannot fail on existing
-- rows. Idempotent (DROP IF EXISTS). Mirrors 0014 / 0016 / 0017.
--> statement-breakpoint

ALTER TABLE "admin_actions"
  DROP CONSTRAINT IF EXISTS "admin_actions_action_type_check";
--> statement-breakpoint
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_action_type_check" CHECK (
  "admin_actions"."action_type" IN (
    'user.created', 'user.updated', 'user.password_reset',
    'user.invite_created', 'user.invite_revoked', 'user.reset_link_created',
    'auth.invite_accepted', 'auth.reset_consumed',
    'auth.password_changed', 'auth.signed_out_everywhere',
    'auth.2fa_enabled', 'auth.2fa_disabled', 'user.force_disabled_2fa',
    'document.created', 'document.synced', 'document.deleted', 'document.restored',
    'calc.created', 'calc.updated', 'calc.deleted', 'calc.synced', 'calc.restored',
    'company.purged'
  )
);
