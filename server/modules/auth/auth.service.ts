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
import { REFRESH_GRACE_WINDOW_MS } from "../../config/constants";
import {
  findUserByIdentifier,
  findUserById,
  insertRefreshToken,
  rotateRefreshTokenAtomically,
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

// Grace window imported from config/constants.ts (single source of
// truth, also used in tests).

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
 * Load a user expected to be active. Single source of truth for the
 * post-JWT-verify check used by `require-auth` middleware and the
 * `/auth/me` endpoint.
 *
 * Throws:
 *   - `TokenInvalidError` if the user row was deleted between token
 *     issuance and the current request.
 *   - `ForbiddenError`    if the user has been marked inactive.
 */
export async function loadActiveUser(userId: string): Promise<User> {
  const user = await findUserById(userId);
  if (!user) {
    throw new TokenInvalidError("Token references a deleted user.");
  }
  if (!user.isActive) {
    throw new ForbiddenError("Account is disabled.");
  }
  return user;
}

/** Public-shape variant of {@link loadActiveUser} for response bodies. */
export async function loadActiveUserPublic(userId: string): Promise<UserPublic> {
  return toUserPublic(await loadActiveUser(userId));
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
  const newRefreshRaw = generateRefreshTokenRaw();

  // Atomic rotation: the repository locks the token row inside a TX
  // (SELECT … FOR UPDATE), so concurrent rotations from different
  // tabs serialise. Returns a discriminated outcome we react to
  // below.
  const outcome = await rotateRefreshTokenAtomically({
    tokenHash,
    newTokenHash: hashRefreshToken(newRefreshRaw),
    newExpiresAt: refreshTokenExpiry()
  });

  if (outcome === null) {
    throw new TokenInvalidError("Refresh token not recognised.");
  }

  const now = new Date();
  if (outcome.oldRow.expiresAt <= now) {
    throw new TokenInvalidError("Refresh token has expired.");
  }

  // Verify the user is still active. Re-fetch on every refresh
  // (cheap UUID-PK lookup) so a freshly disabled user can't keep
  // getting access tokens until their old refresh token expires.
  const userRow = await findUserById(outcome.oldRow.userId);
  if (!userRow) {
    throw new TokenInvalidError("Refresh token references a deleted user.");
  }
  if (!userRow.isActive) {
    throw new ForbiddenError("Account is disabled.");
  }

  if (outcome.kind === "alreadyRevoked") {
    // The token was revoked by an earlier rotation. Apply the 10s
    // grace window: if recent, hand out an access token (the live
    // refresh cookie is the one issued by the rotating tab) and
    // bump last_used_at. Otherwise reject.
    const recentlyRevoked =
      outcome.oldRow.revokedAt !== null &&
      now.getTime() - outcome.oldRow.revokedAt.getTime() <= REFRESH_GRACE_WINDOW_MS;
    if (!recentlyRevoked) {
      throw new TokenInvalidError("Refresh token has been revoked.");
    }
    await touchRefreshToken(outcome.oldRow.id);
    return {
      kind: "graced",
      accessToken: signAccessToken(userRow.id, userRow.isAdmin)
    };
  }

  // Fresh rotation succeeded inside the TX above.
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
