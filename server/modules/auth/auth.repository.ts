/**
 * DB access for the auth module.
 *
 * The ONLY place that imports Drizzle's `db` and runs queries against
 * `users` / `refresh_tokens` for auth purposes. Controllers + services
 * never touch the schema directly — they call these functions.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { refreshTokens, users, type RefreshToken, type User } from "../../db/schema";

// ─── User lookups ──────────────────────────────────────────────────

export async function findUserByIdentifier(identifier: string): Promise<User | undefined> {
  const looksLikeEmail = identifier.includes("@");
  const column = looksLikeEmail ? users.email : users.login;
  const rows = await db.select().from(users).where(eq(column, identifier)).limit(1);
  return rows[0];
}

export async function findUserById(id: string): Promise<User | undefined> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0];
}

// ─── Refresh token operations ──────────────────────────────────────

/** Find a refresh token row by its SHA-256 hash. */
export async function findRefreshTokenByHash(tokenHash: string): Promise<RefreshToken | undefined> {
  const rows = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);
  return rows[0];
}

/** Insert a brand-new refresh token row. */
export async function insertRefreshToken(input: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<RefreshToken> {
  const [row] = await db
    .insert(refreshTokens)
    .values({
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      lastUsedAt: new Date()
    })
    .returning();
  return row;
}

/** Bump `last_used_at` on a refresh token (used in grace-window path). */
export async function touchRefreshToken(id: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(refreshTokens.id, id));
}

/**
 * Rotate: mark the old token revoked + insert a new one in a single
 * TX. Both rows get `last_used_at = now()` so the active-sessions
 * view stays accurate.
 */
export async function rotateRefreshToken(input: {
  oldTokenId: string;
  userId: string;
  newTokenHash: string;
  newExpiresAt: Date;
}): Promise<RefreshToken> {
  return db.transaction(async tx => {
    const now = new Date();
    await tx
      .update(refreshTokens)
      .set({ revokedAt: now, lastUsedAt: now })
      .where(eq(refreshTokens.id, input.oldTokenId));

    const [inserted] = await tx
      .insert(refreshTokens)
      .values({
        userId: input.userId,
        tokenHash: input.newTokenHash,
        expiresAt: input.newExpiresAt,
        lastUsedAt: now
      })
      .returning();

    return inserted;
  });
}

/** Revoke a specific token (used by /auth/logout). */
export async function revokeRefreshToken(tokenHash: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(refreshTokens.tokenHash, tokenHash), sql`${refreshTokens.revokedAt} IS NULL`)
    );
}
