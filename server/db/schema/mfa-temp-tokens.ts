/**
 * `mfa_temp_tokens` — short-lived single-use tokens for the 2FA login
 * step (Phase 8 Stage 2).
 *
 * After a correct password on `/auth/login`, a 2FA-enabled user does NOT
 * get a session — instead we mint a temp token (raw returned in the JSON
 * body, only its sha256 hash stored here, 5-minute TTL) and the client
 * presents it to `/auth/2fa/verify` along with the TOTP / backup code.
 * The row is deleted on use (single-use), so a leaked temp token can't be
 * replayed after the verify completes.
 */

import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const mfaTempTokens = pgTable(
  "mfa_temp_tokens",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  table => ({
    userIdIdx: index("mfa_temp_tokens_user_id_idx").on(table.userId)
  })
);

export type MfaTempToken = typeof mfaTempTokens.$inferSelect;
export type NewMfaTempToken = typeof mfaTempTokens.$inferInsert;
