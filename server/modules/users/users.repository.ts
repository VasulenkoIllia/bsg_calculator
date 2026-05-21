/**
 * DB access for the users module.
 *
 * Owns all queries on the `users` table for admin operations (list,
 * create, patch, reset password). The auth module has its own
 * `auth.repository.ts` for login-time lookups; the two are
 * intentionally separate so business contexts don't cross.
 */

import { desc, eq, or } from "drizzle-orm";
import { db } from "../../db/client";
import { users, type User, type UserRole } from "../../db/schema";
import { expectSingle } from "../../shared/db-helpers";

export async function listUsers(): Promise<User[]> {
  return db.select().from(users).orderBy(desc(users.createdAt));
}

export async function findUserById(id: string): Promise<User | undefined> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

export async function emailOrLoginExists(
  email: string,
  login: string | null
): Promise<boolean> {
  const conditions = [eq(users.email, email)];
  if (login !== null) {
    conditions.push(eq(users.login, login));
  }
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(or(...conditions))
    .limit(1);
  return rows.length > 0;
}

export async function insertUser(input: {
  email: string;
  login: string | null;
  passwordHash: string;
  displayName: string;
  // Phase 8 Stage 1: hierarchical role instead of boolean isAdmin.
  role: UserRole;
}): Promise<User> {
  const rows = await db.insert(users).values(input).returning();
  return expectSingle(rows, "insertUser");
}

/**
 * Update existing user. Returns undefined if no row matched `id`
 * (so callers can surface a NotFoundError); throws InternalError
 * if the row matched but `.returning()` came back empty.
 */
export async function updateUser(
  id: string,
  patch: Partial<Pick<User, "displayName" | "isActive" | "role">>
): Promise<User | undefined> {
  if (Object.keys(patch).length === 0) {
    return findUserById(id);
  }
  const rows = await db
    .update(users)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return rows[0]; // legitimately empty when id doesn't exist
}

export async function updatePasswordHash(id: string, passwordHash: string): Promise<User | undefined> {
  const rows = await db
    .update(users)
    .set({ passwordHash, updatedAt: new Date() })
    .where(eq(users.id, id))
    .returning();
  return rows[0]; // legitimately empty when id doesn't exist
}
