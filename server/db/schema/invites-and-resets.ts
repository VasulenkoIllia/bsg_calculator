/**
 * Sprint 9.O — invite-link and password-reset-link tables.
 *
 * Both are single-use opaque-token tables that gate a public
 * onboarding/recovery flow without requiring SMTP:
 *
 *   1. super_admin issues a token via the admin UI.
 *   2. The raw token is returned ONCE in the create response so the
 *      super_admin can copy + send it manually (Telegram/Slack).
 *   3. The DB only stores `sha256(raw)` — a leaked DB snapshot
 *      can't be replayed against the public endpoints.
 *   4. The invitee/user opens the link, which is a public route
 *      (no JWT required), and submits the form to claim the token.
 *
 * `user_invites` carries only the ROLE — the invitee picks their
 * own email/login/displayName/password. Operator brief: "якщо
 * адмін дає посилання то все повністю заповнює користувач, адмін
 * обирає тільки роль".
 *
 * `password_resets` is bound to an existing user_id — the only
 * thing the user submits is the new password (their identity is
 * already established by token ownership).
 */

import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid
} from "drizzle-orm/pg-core";
import { users } from "./users";

// ────────────────────────────────────────────────────────────────────
// User invites
// ────────────────────────────────────────────────────────────────────

/**
 * The three roles match `USER_ROLES` (kept inline to avoid an import
 * cycle with users.ts). When a fourth tier is added, widen both
 * `users.role` CHECK and this CHECK in lockstep — the migration
 * helper at the top of the SQL file walks through that.
 */
export const INVITE_ROLES = ["user", "admin", "super_admin"] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

export const userInvites = pgTable(
  "user_invites",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    role: text("role").notNull().$type<InviteRole>(),
    /**
     * sha256(raw) hex. The raw token is returned ONCE by the
     * create endpoint and never persisted — a DB snapshot can't be
     * replayed against /accept-invite without the raw value.
     */
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }),
    /**
     * Populated when the invitee successfully accepts. NULL while
     * the invite is still pending. The migration's
     * `user_invites_acceptance_check` enforces that
     * `accepted_at` + `accepted_user_id` move together.
     */
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedUserId: uuid("accepted_user_id").references(() => users.id, {
      onDelete: "set null",
      onUpdate: "cascade"
    }),
    /** super_admin manually revoked before acceptance. */
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    roleCheck: check(
      "user_invites_role_check",
      sql`${table.role} IN ('user', 'admin', 'super_admin')`
    ),
    acceptanceCheck: check(
      "user_invites_acceptance_check",
      sql`(${table.acceptedAt} IS NULL AND ${table.acceptedUserId} IS NULL) OR (${table.acceptedAt} IS NOT NULL AND ${table.acceptedUserId} IS NOT NULL)`
    ),
    /**
     * Hot path: list pending invites for the super_admin Users
     * page. Partial index covers (created_at DESC) WHERE pending —
     * accepted/revoked rows don't bloat the b-tree.
     */
    pendingIdx: index("user_invites_pending_idx")
      .on(table.createdAt)
      .where(sql`${table.acceptedAt} IS NULL AND ${table.revokedAt} IS NULL`)
  })
);

export type UserInvite = typeof userInvites.$inferSelect;
export type NewUserInvite = typeof userInvites.$inferInsert;

// ────────────────────────────────────────────────────────────────────
// Password-reset tokens
// ────────────────────────────────────────────────────────────────────

export const passwordResets = pgTable(
  "password_resets",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict", onUpdate: "cascade" }),
    /** Single-use: once set, the token can't be replayed. */
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    /**
     * Partial index for "active (unused, unexpired) reset tokens
     * for user X". The expires-at check happens at the application
     * layer (`expires_at > now()`) so we keep the index on
     * (user_id, expires_at DESC) without a NOW() WHERE clause.
     */
    activeIdx: index("password_resets_active_idx")
      .on(table.userId, table.expiresAt)
      .where(sql`${table.usedAt} IS NULL`)
  })
);

export type PasswordReset = typeof passwordResets.$inferSelect;
export type NewPasswordReset = typeof passwordResets.$inferInsert;
