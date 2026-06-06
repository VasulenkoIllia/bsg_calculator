-- Sprint 9.X (2026-06-06) — admin "delete company from our system".
--
-- An admin/super_admin can fully (recursively) remove a company that was
-- DELETED in HubSpot (companies.hubspot_deleted_at IS NOT NULL) from OUR
-- DB only — the company + all its documents/deals/configs (+ their events,
-- via cascade). Audit it with a new admin_actions.action_type
-- 'company.purged'. Extends the 0013/0014 controlled vocabulary; the DDL
-- drops + recreates the CHECK (DROP IF EXISTS, so re-running is safe).
--
-- Hand-written: drizzle-kit snapshots are frozen at 0008; migrations 0009+
-- are authored by hand (see 0014's header). target_type stays free-text
-- (no CHECK) so the new 'company' target needs no DB change.

ALTER TABLE "admin_actions"
  DROP CONSTRAINT IF EXISTS "admin_actions_action_type_check";
--> statement-breakpoint

ALTER TABLE "admin_actions"
  ADD CONSTRAINT "admin_actions_action_type_check"
  CHECK ("action_type" IN (
    -- User management (super_admin surface)
    'user.created',
    'user.updated',
    'user.password_reset',
    'user.invite_created',
    'user.invite_revoked',
    'user.reset_link_created',
    -- Public flows (target user is the actor)
    'auth.invite_accepted',
    'auth.reset_consumed',
    'auth.password_changed',
    'auth.signed_out_everywhere',
    -- Documents
    'document.created',
    'document.synced',
    'document.deleted',
    'document.restored',
    -- Calculator-configs
    'calc.created',
    'calc.updated',
    'calc.deleted',
    'calc.synced',
    -- Companies (new) — full local purge of a HubSpot-deleted company
    'company.purged'
  ));
--> statement-breakpoint
