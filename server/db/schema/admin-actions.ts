/**
 * Sprint 9.U — Phase 8 Stage 6 — admin_actions audit log.
 *
 * Append-only log of privileged operator actions. Distinct from the
 * per-entity event logs (`document_events`, `calculator_config_events`):
 * this table answers "what did <admin> do?" rather than "what
 * happened to <entity>?".
 *
 * Design rationale + column-level notes live in
 * `server/db/migrations/0013_admin_actions.sql` — keep this file in
 * sync with the migration's CHECK constraint when adding new
 * action_type values.
 */

import { check, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";

/**
 * Controlled vocabulary mirrored on both sides. Keep in lockstep
 * with the CHECK constraint in `0013_admin_actions.sql`.
 */
export const ADMIN_ACTION_TYPES = [
  // User management (super_admin surface)
  "user.created",
  "user.updated",
  "user.password_reset",
  "user.invite_created",
  "user.invite_revoked",
  "user.reset_link_created",
  // Public flows (target user is the actor)
  "auth.invite_accepted",
  "auth.reset_consumed",
  "auth.password_changed",
  "auth.signed_out_everywhere",
  // Phase 8 Stage 2 — TOTP 2FA lifecycle (self-service + admin recovery).
  "auth.2fa_enabled",
  "auth.2fa_disabled",
  "user.force_disabled_2fa",
  // Document management (any operator role)
  // Sprint 9.X.B — extended to include the create + manual-sync events.
  // Auto-sync from the background setImmediate is NOT logged here
  // (it's a system action, not operator-driven).
  "document.created",
  "document.synced",
  "document.deleted",
  "document.restored",
  // Calc-config management — Sprint 9.X.B added the full CRUD + manual
  // sync set. Same auto-sync exclusion rule as documents.
  "calc.created",
  "calc.updated",
  "calc.deleted",
  "calc.synced",
  "calc.restored",
  // Companies — full LOCAL purge of a HubSpot-deleted company (admin).
  "company.purged"
] as const;

export type AdminActionType = (typeof ADMIN_ACTION_TYPES)[number];

/**
 * `target_type` enum. Free-form-ish in DB (no CHECK) because we may
 * add new target categories without a migration, but the TS layer
 * narrows to this set. `null` is valid for global actions.
 *
 * Sprint 9.Y.A M2 audit fix — promoted from a plain union to a
 * single source of truth (`as const` tuple + derived type). The Zod
 * query schema for the audit-log filter (Sprint 9.X.C) used to
 * re-declare these five strings inline; both now read from the same
 * constant, so adding a sixth target category is a one-line change.
 */
export const ADMIN_ACTION_TARGET_TYPES = [
  "user",
  "document",
  "calc_config",
  "invite",
  "reset",
  "company"
] as const;

export type AdminActionTargetType = (typeof ADMIN_ACTION_TARGET_TYPES)[number];

export const adminActions = pgTable(
  "admin_actions",
  {
    id: uuid("id").primaryKey().defaultRandom().notNull(),

    // Actor — FK is SET NULL so a future user deletion doesn't break
    // the log row. Display fields are denormalised at write-time so
    // the listing renders without a JOIN.
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
      onUpdate: "cascade"
    }),
    actorDisplayName: text("actor_display_name").notNull(),
    actorEmail: text("actor_email").notNull(),

    // Action — Zod will narrow this on the way out via AdminActionType.
    actionType: text("action_type").notNull(),

    // Target (optional).
    targetType: text("target_type"),
    targetId: text("target_id"),

    // Structured payload. Defaults to `{}` so callers can rely on it
    // being a non-null JSON object.
    meta: jsonb("meta")
      .notNull()
      .default(sql`'{}'::jsonb`)
      .$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull()
  },
  table => ({
    createdAtIdx: index("admin_actions_created_at_idx").on(
      table.createdAt.desc()
    ),
    targetIdx: index("admin_actions_target_idx").on(
      table.targetType,
      table.targetId
    ),
    // Mirrors the migration's CHECK. Drizzle's `check()` is a
    // runtime-only constraint — the migration applies it; the schema
    // declaration here documents intent.
    actionTypeCheck: check(
      "admin_actions_action_type_check",
      sql`${table.actionType} IN (
        'user.created', 'user.updated', 'user.password_reset',
        'user.invite_created', 'user.invite_revoked',
        'user.reset_link_created',
        'auth.invite_accepted', 'auth.reset_consumed',
        'auth.password_changed', 'auth.signed_out_everywhere',
        'auth.2fa_enabled', 'auth.2fa_disabled', 'user.force_disabled_2fa',
        'document.created', 'document.synced',
        'document.deleted', 'document.restored',
        'calc.created', 'calc.updated', 'calc.deleted', 'calc.synced',
        'calc.restored',
        'company.purged'
      )`
    )
  })
);

export type AdminAction = typeof adminActions.$inferSelect;
export type NewAdminAction = typeof adminActions.$inferInsert;
