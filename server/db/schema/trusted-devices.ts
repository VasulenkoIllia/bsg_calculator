/**
 * `trusted_devices` — "Trust this browser for 30 days" (Phase 8 Stage 2).
 *
 * When a user checks "trust this browser" at the 2FA step, we mint a
 * random device token, store its sha256 hash here (raw goes into a
 * signed httpOnly cookie), and skip the TOTP prompt on subsequent logins
 * from that device while the row is alive.
 *
 * `fingerprint_hash` = sha256(User-Agent + first two octets of the IP).
 * Re-checked on each login so a stolen cookie replayed from a very
 * different device/network is rejected; the 2-octet IP prefix tolerates
 * mobile-IP churn within a carrier. 30-day TTL via `expires_at`.
 */

import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const trustedDevices = pgTable(
  "trusted_devices",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade", onUpdate: "cascade" }),
    // sha256(raw cookie token). Raw lives only in the signed cookie.
    tokenHash: text("token_hash").notNull().unique(),
    // sha256(UA + first-2-IP-octets) — re-verified on each trusted login.
    fingerprintHash: text("fingerprint_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  table => ({
    // Drives the per-login "is this device trusted?" lookup + the
    // "revoke my devices on disable / force-disable" cleanup.
    userTokenIdx: index("trusted_devices_user_token_idx").on(
      table.userId,
      table.tokenHash
    )
  })
);

export type TrustedDevice = typeof trustedDevices.$inferSelect;
export type NewTrustedDevice = typeof trustedDevices.$inferInsert;
