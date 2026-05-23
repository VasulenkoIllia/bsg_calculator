-- Sprint 9.X.B (2026-05-23) — extend admin_actions controlled vocabulary
-- with document.created, document.synced, and the calc-config CRUD +
-- sync set. Mirrors the operator brief: every operator-driven change
-- to a document or saved calculator now lands in the audit log so the
-- "хто і коли" question has a single source of truth.
--
-- Why a new migration vs. editing 0013: migrations are immutable once
-- applied. Production already has 0013's smaller vocabulary; this file
-- drops + recreates the CHECK constraint with the expanded list. The
-- DDL is idempotent (DROP IF EXISTS) so re-running is safe.
--
-- Note: this migration is INERT for `meta` / `target_*` shape — those
-- columns are jsonb / text and don't need a schema change to accept
-- the new payload keys.

ALTER TABLE "admin_actions"
  DROP CONSTRAINT IF EXISTS "admin_actions_action_type_check";
--> statement-breakpoint

ALTER TABLE "admin_actions"
  ADD CONSTRAINT "admin_actions_action_type_check"
  CHECK ("action_type" IN (
    -- User management (super_admin surface) — unchanged from 0013
    'user.created',
    'user.updated',
    'user.password_reset',
    'user.invite_created',
    'user.invite_revoked',
    'user.reset_link_created',
    -- Public flows (target user is the actor) — unchanged from 0013
    'auth.invite_accepted',
    'auth.reset_consumed',
    'auth.password_changed',
    'auth.signed_out_everywhere',
    -- Documents (extends 0013 set)
    'document.created',       -- POST /documents (operator save)
    'document.synced',        -- POST /documents/:number/sync (manual click)
    'document.deleted',
    'document.restored',
    -- Calculator-configs (new set, full CRUD + manual sync)
    'calc.created',           -- POST /calculator-configs
    'calc.updated',           -- PUT /calculator-configs/:id (operator edit)
    'calc.deleted',           -- DELETE /calculator-configs/:id
    'calc.synced'             -- POST /calculator-configs/:id/sync (manual)
  ));
--> statement-breakpoint
