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
import { expectSingle } from "../../shared/db-helpers";

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
  const rows = await db
    .insert(refreshTokens)
    .values({
      userId: input.userId,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      lastUsedAt: new Date()
    })
    .returning();
  return expectSingle(rows, "insertRefreshToken");
}

/** Bump `last_used_at` on a refresh token (used in grace-window path). */
export async function touchRefreshToken(id: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(refreshTokens.id, id));
}

/**
 * Race-safe refresh rotation.
 *
 * Looks up the current refresh-token row inside a TX using
 * `SELECT … FOR UPDATE`, so two concurrent rotations from different
 * tabs serialise on the row lock. The second tab will see a token
 * with `revoked_at` already set and the caller can apply the grace
 * window logic.
 *
 * Returns a discriminated union so the caller (`auth.service.refresh`)
 * knows exactly what happened without having to re-query.
 */
export type RotationOutcome =
  | { kind: "rotated"; oldRow: RefreshToken; newRow: RefreshToken }
  | { kind: "alreadyRevoked"; oldRow: RefreshToken };

export async function rotateRefreshTokenAtomically(input: {
  tokenHash: string;
  newTokenHash: string;
  newExpiresAt: Date;
}): Promise<RotationOutcome | null> {
  return db.transaction(async tx => {
    // Lock the row for the duration of the TX. Drizzle wraps the
    // SELECT in `.for("update")`; concurrent rotations queue.
    const found = await tx
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.tokenHash, input.tokenHash))
      .limit(1)
      .for("update");
    const row = found[0];
    if (!row) return null;

    // If already revoked, return without rotating — the caller
    // decides whether the grace window applies.
    if (row.revokedAt !== null) {
      return { kind: "alreadyRevoked", oldRow: row };
    }

    const now = new Date();
    await tx
      .update(refreshTokens)
      .set({ revokedAt: now, lastUsedAt: now })
      .where(eq(refreshTokens.id, row.id));

    const insertedRows = await tx
      .insert(refreshTokens)
      .values({
        userId: row.userId,
        tokenHash: input.newTokenHash,
        expiresAt: input.newExpiresAt,
        lastUsedAt: now
      })
      .returning();
    const newRow = expectSingle(insertedRows, "rotateRefreshTokenAtomically.insert");

    return { kind: "rotated", oldRow: row, newRow };
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
