/**
 * `totp_backup_codes` — one-time recovery codes for 2FA (Phase 8 Stage 2).
 *
 * Generated (10 at a time) when a user enables 2FA or regenerates codes.
 * We store ONLY the sha256 hash (same pattern as refresh_tokens / invites)
 * — the raw codes are shown to the operator ONCE at generation and never
 * re-fetchable. A code is consumed by setting `used_at`; a code with a
 * non-null `used_at` can't be used again.
 */

import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const totpBackupCodes = pgTable(
  "totp_backup_codes",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    // sha256(raw). Raw code never persisted.
    codeHash: text("code_hash").notNull().unique(),
    // NULL = unused; set to now() when redeemed (single-use).
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  table => ({
    userIdIdx: index("totp_backup_codes_user_id_idx").on(table.userId)
  })
);

export type TotpBackupCode = typeof totpBackupCodes.$inferSelect;
export type NewTotpBackupCode = typeof totpBackupCodes.$inferInsert;
