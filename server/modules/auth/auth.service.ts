/**
 * Auth service — login / refresh (with grace window) / logout.
 *
 * Implements the refresh-token rotation contract specified in
 * `phase_08_backend_plan.md` §9.
 *
 * Public surface (all async):
 *   login({ identifier, password }) → { accessToken, refreshTokenRaw, user }
 *   refresh(refreshTokenRaw)        → { accessToken, refreshTokenRaw? }  (rotated)
 *   logout(refreshTokenRaw)         → void
 *
 * Refresh policy:
 *   - Issued on login. Stored as SHA-256 hash in refresh_tokens.
 *   - Rotated on every /auth/refresh call (old revoked + new inserted).
 *   - 10-second grace window: a refresh token revoked within the last
 *     10s is still accepted, but the call returns ONLY a new access
 *     token (no new refresh). Absorbs multi-tab races.
 *   - last_used_at bumped on every successful use (incl. grace).
 */

import bcrypt from "bcrypt";
import { env } from "../../config/env";
import {
  findUserByIdentifier,
  findUserById,
  findRefreshTokenByHash,
  insertRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  touchRefreshToken
} from "./auth.repository";
import {
  generateRefreshTokenRaw,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken
} from "./auth.tokens";
import {
  ForbiddenError,
  InvalidCredentialsError,
  TokenInvalidError
} from "../../shared/errors";
import type { User } from "../../db/schema";
import type { UserPublic } from "./auth.schemas";

// Grace window — see header. Hard-coded; not an env knob because 10s
// is a security boundary, not a config tuning value.
const GRACE_WINDOW_MS = 10_000;

function toUserPublic(user: User): UserPublic {
  return {
    id: user.id,
    email: user.email,
    login: user.login,
    displayName: user.displayName,
    isAdmin: user.isAdmin,
    isActive: user.isActive
  };
}

/**
 * Verify identifier + password, issue tokens.
 */
export async function login(input: {
  identifier: string;
  password: string;
}): Promise<{ accessToken: string; refreshTokenRaw: string; user: UserPublic }> {
  const user = await findUserByIdentifier(input.identifier);
  if (!user) {
    // Don't reveal whether the user exists — same error for missing
    // user vs wrong password. Run a dummy bcrypt compare to keep the
    // timing roughly equal (defence against user-enumeration timing
    // attacks).
    await bcrypt.compare(input.password, "$2b$12$DummyHashToConstantTimeCompare.PreventEnum");
    throw new InvalidCredentialsError();
  }

  if (!user.isActive) {
    throw new ForbiddenError("Account is disabled.");
  }

  const ok = await bcrypt.compare(input.password, user.passwordHash);
  if (!ok) {
    throw new InvalidCredentialsError();
  }

  const refreshTokenRaw = generateRefreshTokenRaw();
  await insertRefreshToken({
    userId: user.id,
    tokenHash: hashRefreshToken(refreshTokenRaw),
    expiresAt: refreshTokenExpiry()
  });

  return {
    accessToken: signAccessToken(user.id, user.isAdmin),
    refreshTokenRaw,
    user: toUserPublic(user)
  };
}

export type RefreshOutcome =
  | { kind: "rotated"; accessToken: string; refreshTokenRaw: string }
  | { kind: "graced"; accessToken: string }; // grace-window: no new refresh

/**
 * Verify a refresh token and rotate it.
 *
 * Returns:
 *   { kind: "rotated" } — fresh rotation; client must update cookie.
 *   { kind: "graced" }  — within 10s grace; access token only.
 *
 * Throws TokenInvalidError on:
 *   - token unknown
 *   - token expired
 *   - token revoked > 10s ago
 *   - user is disabled
 */
export async function refresh(refreshTokenRaw: string): Promise<RefreshOutcome> {
  const tokenHash = hashRefreshToken(refreshTokenRaw);
  const row = await findRefreshTokenByHash(tokenHash);
  if (!row) {
    throw new TokenInvalidError("Refresh token not recognised.");
  }

  const now = new Date();
  if (row.expiresAt <= now) {
    throw new TokenInvalidError("Refresh token has expired.");
  }

  // Grace window: revoked within the last GRACE_WINDOW_MS is still ok.
  const recentlyRevoked =
    row.revokedAt !== null &&
    now.getTime() - row.revokedAt.getTime() <= GRACE_WINDOW_MS;

  if (row.revokedAt && !recentlyRevoked) {
    // Permanently revoked. Token reuse after the grace window may
    // indicate compromise; log handled by middleware.
    throw new TokenInvalidError("Refresh token has been revoked.");
  }

  // Verify the user is still active. We re-fetch on every refresh
  // (cheap UUID-PK lookup) so a freshly disabled user can't keep
  // getting access tokens until their old refresh token expires.
  const userRow = await findUserById(row.userId);
  if (!userRow) {
    throw new TokenInvalidError("Refresh token references a deleted user.");
  }
  if (!userRow.isActive) {
    throw new ForbiddenError("Account is disabled.");
  }

  if (recentlyRevoked) {
    // 10s grace path: bump last_used_at, return access token only.
    await touchRefreshToken(row.id);
    return {
      kind: "graced",
      accessToken: signAccessToken(userRow.id, userRow.isAdmin)
    };
  }

  // Fresh rotation: revoke old + insert new in a TX.
  const newRefreshRaw = generateRefreshTokenRaw();
  await rotateRefreshToken({
    oldTokenId: row.id,
    userId: userRow.id,
    newTokenHash: hashRefreshToken(newRefreshRaw),
    newExpiresAt: refreshTokenExpiry()
  });

  return {
    kind: "rotated",
    accessToken: signAccessToken(userRow.id, userRow.isAdmin),
    refreshTokenRaw: newRefreshRaw
  };
}

/**
 * Revoke a refresh token. Idempotent (no-op if already revoked).
 * Always succeeds — even an unknown token returns OK because we
 * don't want the client to know whether the token was valid.
 */
export async function logout(refreshTokenRaw: string): Promise<void> {
  const tokenHash = hashRefreshToken(refreshTokenRaw);
  await revokeRefreshToken(tokenHash);
}
