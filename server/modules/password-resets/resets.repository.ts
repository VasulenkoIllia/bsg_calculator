/**
 * Sprint 9.O — `password_resets` data access.
 *
 * Mirror of invites.repository in structure (same sha256+token
 * pattern) but bound to an existing user_id instead of carrying a
 * role. The token's only payload is "the bearer is authorised to
 * set this user's password to whatever they submit, ONCE".
 *
 * Two safety properties enforced by the queries:
 *   - `findAliveTokenByRaw` filters expired + already-used so the
 *     same raw token can't be replayed.
 *   - `markUsed` is the optimistic-UPDATE write that consumes the
 *     token. Two concurrent /reset-password calls with the same
 *     raw token can both pass the read check, but only ONE
 *     UPDATE returns a row (the other gets undefined → 409 at the
 *     service layer).
 */

import { and, eq, gt, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { passwordResets, type PasswordReset } from "../../db/schema";
import { expectSingle } from "../../shared/db-helpers";
import { generateRawToken, hashToken } from "../../shared/token-utils";

export interface CreatedReset {
  row: PasswordReset;
  rawToken: string;
}

export async function createPasswordReset(input: {
  userId: string;
  createdByUserId: string;
  ttlHours: number;
}): Promise<CreatedReset> {
  const rawToken = generateRawToken();
  const expiresAt = new Date(Date.now() + input.ttlHours * 60 * 60 * 1000);
  const rows = await db
    .insert(passwordResets)
    .values({
      userId: input.userId,
      tokenHash: hashToken(rawToken),
      expiresAt,
      createdByUserId: input.createdByUserId
    })
    .returning();
  return { row: expectSingle(rows, "createPasswordReset"), rawToken };
}

/**
 * Look up a reset token + verify still-usable. Returns undefined
 * for unknown/expired/used. Public callers translate undefined →
 * `404 RESET_INVALID` without revealing which state.
 */
export async function findAliveResetByRawToken(
  rawToken: string
): Promise<PasswordReset | undefined> {
  const tokenHash = hashToken(rawToken);
  const rows = await db
    .select()
    .from(passwordResets)
    .where(
      and(
        eq(passwordResets.tokenHash, tokenHash),
        isNull(passwordResets.usedAt),
        gt(passwordResets.expiresAt, new Date())
      )
    )
    .limit(1);
  return rows[0];
}

/**
 * Mark a token as consumed. Optimistic guard: only flips `used_at`
 * if the row is still unused (the WHERE clause). Returns undefined
 * for the race-loser case → caller throws 409.
 */
export async function markResetUsed(
  id: string
): Promise<PasswordReset | undefined> {
  const rows = await db
    .update(passwordResets)
    .set({ usedAt: new Date() })
    .where(and(eq(passwordResets.id, id), isNull(passwordResets.usedAt)))
    .returning();
  return rows[0];
}
