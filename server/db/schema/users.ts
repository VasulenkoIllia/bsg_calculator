/**
 * `users` table — auth identities.
 *
 * Schema spec: `docs/phase_08_backend_plan.md` §3.
 * Decisions:   `docs/decisions.md` → "Phase 8 architectural conventions"
 *              (citext, is_admin) and "Phase 8 DB audit cleanup" (defaults).
 */

import { sql } from "drizzle-orm";
import { boolean, customType, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Drizzle has no built-in `citext` column type; declare one ourselves
// so the schema typechecks AND Drizzle Kit emits `citext` (not `text`)
// in the generated migration.
const citext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext";
  }
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  // Login identifier. Case-insensitive via `citext` so the UNIQUE
  // constraint catches "User@bsg.com" vs "user@bsg.com" duplicates,
  // and ordinary `WHERE email = $1` works without `LOWER()` wrapping.
  email: citext("email").notNull().unique(),
  // Optional short login; NULL if the user logs in with email.
  login: citext("login").unique(),
  // bcrypt hash. Cost is BCRYPT_COST (default 12; 4 in test env).
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull().default(""),
  isActive: boolean("is_active").notNull().default(true),
  // Gates /api/v1/users/* endpoints. First admin created via
  // `npm run create-user -- --admin`.
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
