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
 * Sprint 9.R — default role is `admin`. Pre-9.R the helper defaulted
 * to `user`, but the 9.R route gates tightened the user→admin
 * boundary on every mutating endpoint, so the integration suite's
 * implicit "default authenticated caller" is now admin. The handful
 * of tests that explicitly verify the read-only `user` tier pass
 * `role: "user"` explicitly — search test files for `role: "user"`
 * to find them.
 *
 * Sprint 9.S audit fix — the legacy `isAdmin` boolean parameter was
 * removed. It had become a footgun (`isAdmin: false` resolved to
 * "admin" after the default flip due to a tautological ternary).
 * Callers should pass `role:` explicitly when they need anything
 * other than the admin default.
 */
export async function createTestUser(input: {
  email: string;
  password: string;
  login?: string;
  displayName?: string;
  role?: "user" | "admin" | "super_admin";
  isActive?: boolean;
}): Promise<User> {
  // bcrypt cost is forced to 4 in tests via setup.ts → BCRYPT_COST.
  const passwordHash = await bcrypt.hash(input.password, 4);
  const resolvedRole = input.role ?? "admin";
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

/**
 * Sprint 9.V audit fix M2 — centralised login helper.
 * Previously duplicated across 12 test files; the two flavours
 * (returns just the token vs. returns {token, cookie}) are exported
 * separately so each call site picks the shape it actually needs.
 *
 * Both throw on non-200 with the email + status in the message so a
 * mistyped password surfaces obviously in the test failure output
 * instead of as a cryptic 401 elsewhere.
 */
import request from "supertest";

export async function loginAsToken(
  email: string,
  password: string
): Promise<string> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ identifier: email, password });
  if (res.status !== 200) {
    throw new Error(`loginAsToken ${email} failed: ${res.status}`);
  }
  return res.body.accessToken;
}

export async function loginAsSession(
  email: string,
  password: string
): Promise<{ accessToken: string; refreshCookie: string }> {
  const res = await request(app)
    .post("/api/v1/auth/login")
    .send({ identifier: email, password });
  if (res.status !== 200) {
    throw new Error(`loginAsSession ${email} failed: ${res.status}`);
  }
  return {
    accessToken: res.body.accessToken,
    refreshCookie: extractRefreshCookie(res.headers["set-cookie"])
  };
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
