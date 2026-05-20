/**
 * `refresh_tokens` table — rotating opaque tokens for JWT refresh flow.
 *
 * Rotation: each `/auth/refresh` revokes the old row and inserts a new
 * one. 10-second grace window absorbs multi-tab races (see
 * `phase_08_backend_plan.md` §9 + decisions.md).
 *
 * We never store the raw token — only its SHA-256 hash. The raw value
 * lives only in the httpOnly cookie on the client.
 */

import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    // NULL while valid. Set to `now()` during rotation (the new sibling
    // row is inserted in the same TX). A revoked-within-10s row is
    // still honoured by the grace-window branch.
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    // Bumped on every successful /auth/refresh (including grace).
    // Powers the "active sessions" view in Phase 9.
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  table => ({
    // Used to list all sessions for a user + "logout everywhere".
    userIdIdx: index("refresh_tokens_user_id_idx").on(table.userId),
    // Partial index: 99% of "list my active sessions" reads only the
    // un-revoked rows, so a partial WHERE keeps the index tiny.
    activeByUserIdx: index("refresh_tokens_active_by_user_idx")
      .on(table.userId)
      .where(sql`${table.revokedAt} IS NULL`)
  })
);

export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
