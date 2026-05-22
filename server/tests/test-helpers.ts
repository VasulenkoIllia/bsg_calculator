/**
 * Test fixtures + helpers shared across integration tests.
 *
 * - `app` is a single Express instance built once per test file
 *   (createApp is cheap and stateless aside from the DB pool).
 * - `createTestUser` inserts a user directly via Drizzle (skipping
 *   the API) so we can set up arbitrary states before exercising
 *   the endpoint under test.
 */

import bcrypt from "bcrypt";
import { createApp } from "../app";
import { db } from "../db/client";
import { users, type User } from "../db/schema";

export const app = createApp();

/**
 * Phase 8 Stage 1: tests can now pass either the new `role` field
 * OR the legacy `isAdmin` boolean (for backward-compat with the
 * older test suites that haven't been touched yet).
 *
 * Sprint 9.R — default role changed from "user" to "admin".
 * Rationale: Sprint 9.R tightened the user→admin boundary on
 * mutating endpoints (POST /documents, POST/PUT/DELETE
 * /calculator-configs, etc.), so the pre-9.R "default authenticated
 * caller" behaviour is now `admin`. The integration suite assumes
 * the actor can mutate; only the handful of tests that explicitly
 * test the read-only `user` tier should now pass `role: "user"`.
 */
export async function createTestUser(input: {
  email: string;
  password: string;
  login?: string;
  displayName?: string;
  role?: "user" | "admin" | "super_admin";
  isAdmin?: boolean;
  isActive?: boolean;
}): Promise<User> {
  // bcrypt cost is forced to 4 in tests via setup.ts → BCRYPT_COST.
  const passwordHash = await bcrypt.hash(input.password, 4);
  const resolvedRole = input.role ?? (input.isAdmin ? "admin" : "admin");
  const [row] = await db
    .insert(users)
    .values({
      email: input.email,
      login: input.login ?? null,
      passwordHash,
      displayName: input.displayName ?? "Test",
      role: resolvedRole,
      isActive: input.isActive ?? true
    })
    .returning();
  if (!row) throw new Error("createTestUser: insert returned no row");
  return row;
}

/** Extract the bsg_refresh cookie from a Set-Cookie header. */
export function extractRefreshCookie(setCookieHeader: string | string[] | undefined): string {
  if (!setCookieHeader) return "";
  const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const cookie of cookies) {
    const match = /^bsg_refresh=([^;]+)/.exec(cookie);
    if (match) return match[1];
  }
  return "";
}
