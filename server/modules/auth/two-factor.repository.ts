/**
 * Persistence for TOTP 2FA (Phase 8 Stage 2): the per-user secret columns
 * on `users`, plus the three child tables (backup codes, trusted devices,
 * login temp tokens). Pure DB access — no business logic.
 */

import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client";
import {
  mfaTempTokens,
  totpBackupCodes,
  trustedDevices,
  users
} from "../../db/schema";

// ─── users TOTP columns ──────────────────────────────────────────────

/** Store an encrypted secret in the PENDING state (enabled_at stays NULL). */
export async function setPendingTotpSecret(
  userId: string,
  encryptedSecret: string
): Promise<void> {
  await db
    .update(users)
    .set({ totpSecretEncrypted: encryptedSecret, totpEnabledAt: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/** Flip a pending secret to ACTIVE. */
export async function activateTotp(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ totpEnabledAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/** Clear the secret + activation (used by disable + force-disable). */
export async function clearTotpSecret(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ totpSecretEncrypted: null, totpEnabledAt: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

// ─── backup codes ────────────────────────────────────────────────────

export async function replaceBackupCodes(
  userId: string,
  codeHashes: string[]
): Promise<void> {
  await db.transaction(async tx => {
    await tx.delete(totpBackupCodes).where(eq(totpBackupCodes.userId, userId));
    if (codeHashes.length > 0) {
      await tx
        .insert(totpBackupCodes)
        .values(codeHashes.map(codeHash => ({ userId, codeHash })));
    }
  });
}

export async function deleteBackupCodes(userId: string): Promise<void> {
  await db.delete(totpBackupCodes).where(eq(totpBackupCodes.userId, userId));
}

/** Find an UNUSED backup code row by its hash for this user. */
export async function findUnusedBackupCode(userId: string, codeHash: string) {
  const rows = await db
    .select()
    .from(totpBackupCodes)
    .where(
      and(
        eq(totpBackupCodes.userId, userId),
        eq(totpBackupCodes.codeHash, codeHash),
        isNull(totpBackupCodes.usedAt)
      )
    )
    .limit(1);
  return rows[0];
}

/** Mark a backup code consumed. Returns true if it flipped an unused row. */
export async function consumeBackupCode(id: string): Promise<boolean> {
  const rows = await db
    .update(totpBackupCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(totpBackupCodes.id, id), isNull(totpBackupCodes.usedAt)))
    .returning({ id: totpBackupCodes.id });
  return rows.length > 0;
}

export async function countUnusedBackupCodes(userId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(totpBackupCodes)
    .where(and(eq(totpBackupCodes.userId, userId), isNull(totpBackupCodes.usedAt)));
  return rows[0]?.n ?? 0;
}

// ─── trusted devices ─────────────────────────────────────────────────

export async function insertTrustedDevice(input: {
  userId: string;
  tokenHash: string;
  fingerprintHash: string;
  expiresAt: Date;
}): Promise<void> {
  await db.insert(trustedDevices).values(input);
}

/**
 * A trusted-device match requires the cookie token hash AND the device
 * fingerprint AND a future expiry — so a stolen cookie replayed from a
 * different UA/network is rejected.
 */
export async function findAliveTrustedDevice(input: {
  userId: string;
  tokenHash: string;
  fingerprintHash: string;
}) {
  const rows = await db
    .select()
    .from(trustedDevices)
    .where(
      and(
        eq(trustedDevices.userId, input.userId),
        eq(trustedDevices.tokenHash, input.tokenHash),
        eq(trustedDevices.fingerprintHash, input.fingerprintHash),
        gt(trustedDevices.expiresAt, new Date())
      )
    )
    .limit(1);
  return rows[0];
}

export async function deleteTrustedDevices(userId: string): Promise<void> {
  await db.delete(trustedDevices).where(eq(trustedDevices.userId, userId));
}

// ─── login temp tokens ───────────────────────────────────────────────

export async function insertMfaTempToken(input: {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}): Promise<void> {
  await db.insert(mfaTempTokens).values(input);
}

/**
 * Look up a temp token by hash, only if still alive (expiry checked at the
 * DB clock — no Node/Postgres skew window). Does NOT delete: a wrong code
 * should let the user retry the SAME token (bounded by the 5-min TTL + the
 * /verify rate limit). The caller deletes it on a SUCCESSFUL verify.
 */
export async function findAliveMfaTempToken(tokenHash: string) {
  const rows = await db
    .select()
    .from(mfaTempTokens)
    .where(
      and(
        eq(mfaTempTokens.tokenHash, tokenHash),
        gt(mfaTempTokens.expiresAt, sql`now()`)
      )
    )
    .limit(1);
  return rows[0];
}

/** Delete a temp token by hash (single-use on a successful verify). */
export async function deleteMfaTempToken(tokenHash: string): Promise<void> {
  await db.delete(mfaTempTokens).where(eq(mfaTempTokens.tokenHash, tokenHash));
}
