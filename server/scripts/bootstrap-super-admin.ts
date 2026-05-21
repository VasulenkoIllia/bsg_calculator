/**
 * Phase 8 Stage 1: bootstrap super-admin promoter.
 *
 * Runs once at server startup. Reads `BOOTSTRAP_SUPER_ADMIN_EMAIL`
 * from env and, if set:
 *   - looks up the user by that email
 *   - if found and current role is NOT already `super_admin`, promotes
 *     them to `super_admin` and logs the change
 *   - if not found, logs a warning (operator probably typo'd the
 *     email OR hasn't run `create-user` yet)
 *
 * This is the single chokepoint for granting `super_admin` outside
 * of an existing super-admin's UI action (Phase 8 Stage 3). It lets
 * a fresh deploy reach the first super-admin via env config alone,
 * without needing a manual SQL UPDATE.
 *
 * Safe to run on every boot — promotion is idempotent (already-
 * promoted user is a no-op). NEVER demotes (so removing the env var
 * doesn't strip privileges from an existing super-admin).
 */

import { sql } from "drizzle-orm";
import { db } from "../db/client";
import { users } from "../db/schema";
import { env } from "../config/env";
import { logger } from "../middleware/logger";

export async function bootstrapSuperAdmin(): Promise<void> {
  const email = env.BOOTSTRAP_SUPER_ADMIN_EMAIL;
  if (!email || email.length === 0) {
    // No bootstrap configured. Either fresh deploy without bootstrap
    // (a super-admin will be created manually via create-user.ts
    // --super-admin) OR a follow-up boot where the env was
    // intentionally cleared. Either way no action.
    return;
  }

  // citext column → case-insensitive match. Email format already
  // validated by the env schema upstream.
  const result = await db
    .update(users)
    .set({ role: "super_admin", updatedAt: new Date() })
    .where(sql`${users.email} = ${email} AND ${users.role} != 'super_admin'`)
    .returning({ id: users.id, email: users.email });

  if (result.length === 1) {
    logger.info(
      { email, userId: result[0].id },
      "[bootstrap-super-admin] promoted user to super_admin"
    );
    return;
  }

  // Either the user already had the role (no-op, no row updated) or
  // the user doesn't exist. Disambiguate with a follow-up read so
  // the log message is precise.
  const existing = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(sql`${users.email} = ${email}`)
    .limit(1);

  if (existing.length === 0) {
    logger.warn(
      { email },
      "[bootstrap-super-admin] BOOTSTRAP_SUPER_ADMIN_EMAIL set but no user with that email exists yet. Create the user first via `npx tsx server/scripts/create-user.ts --email=… --password=…`, then restart."
    );
    return;
  }

  // Already super_admin — silent no-op (the most common steady-state
  // path on every restart). Logged at debug level so a verbose run
  // can confirm the promotion happened on a previous boot.
  logger.debug(
    { email, userId: existing[0].id, role: existing[0].role },
    "[bootstrap-super-admin] target user already super_admin — no change"
  );
}
