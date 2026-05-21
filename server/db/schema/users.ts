/**
 * `users` table — auth identities.
 *
 * Schema spec: `docs/phase_08_backend_plan.md` §3.
 * Decisions:   `docs/decisions.md` → "Phase 8 architectural conventions"
 *              (citext, is_admin) and "Phase 8 DB audit cleanup" (defaults).
 *
 * Phase 8 Stage 1 (2026-05-21): the boolean `is_admin` was replaced
 * with a hierarchical `role` enum (`user` ⊂ `admin` ⊂ `super_admin`).
 * See `docs/phase_8_security_admin_audit.md` Stage 1 for the design;
 * migration 0007 backfills existing `is_admin=true` rows to
 * `role='admin'`. The bootstrap super-admin is promoted at runtime
 * via `BOOTSTRAP_SUPER_ADMIN_EMAIL` (see server/scripts/bootstrap-
 * super-admin.ts).
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

/**
 * Phase 8 Stage 1: hierarchical role enum. Higher tiers inherit
 * the permissions of lower ones — `requireRole('admin')` middleware
 * accepts both `admin` and `super_admin`. Convention enforced via a
 * CHECK constraint at the DB level + a TypeScript union below.
 */
export const USER_ROLES = ["user", "admin", "super_admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

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
  /**
   * Hierarchical role. Default `user` so a fresh row from a forgotten
   * migration path lands at the LEAST privileged tier. The
   * `BOOTSTRAP_SUPER_ADMIN_EMAIL` env var promotes a single user to
   * `super_admin` at app startup (see Stage 1.D).
   */
  role: text("role")
    .notNull()
    .default("user")
    .$type<UserRole>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
