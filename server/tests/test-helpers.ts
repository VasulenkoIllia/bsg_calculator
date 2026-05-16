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

export async function createTestUser(input: {
  email: string;
  password: string;
  login?: string;
  displayName?: string;
  isAdmin?: boolean;
  isActive?: boolean;
}): Promise<User> {
  // bcrypt cost is forced to 4 in tests via setup.ts → BCRYPT_COST.
  const passwordHash = await bcrypt.hash(input.password, 4);
  const [row] = await db
    .insert(users)
    .values({
      email: input.email,
      login: input.login ?? null,
      passwordHash,
      displayName: input.displayName ?? "Test",
      isAdmin: input.isAdmin ?? false,
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
