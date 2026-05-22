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
import { REFRESH_GRACE_WINDOW_MS } from "../../config/constants";
import {
  findUserByIdentifier,
  findUserById,
  insertRefreshToken,
  rotateRefreshTokenAtomically,
  revokeAllRefreshTokensForUser,
  revokeRefreshToken,
  touchRefreshToken
} from "./auth.repository";
import { updatePasswordHash } from "../users/users.repository";
import {
  generateRefreshTokenRaw,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken
} from "./auth.tokens";
import {
  ForbiddenError,
  InternalError,
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
    // Phase 8 Stage 1: `role` enum replaces the old `isAdmin: boolean`.
    role: user.role,
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
/**
 * Sprint 9.O — extracted from `login` so the invite-accept flow
 * (and any future "passwordless" path) can issue a token pair
 * without re-implementing the rotation + insert dance.
 *
 * Pre-condition: caller has already verified the user's identity
 * (bcrypt match for login, single-use token consumption for
 * invite-accept, etc.) AND that `user.isActive`. The helper does
 * not re-check — it just emits the tokens.
 */
export async function issueTokenPairForUser(
  user: User
): Promise<{ accessToken: string; refreshToken: string }> {
  const refreshTokenRaw = generateRefreshTokenRaw();
  await insertRefreshToken({
    userId: user.id,
    tokenHash: hashRefreshToken(refreshTokenRaw),
    expiresAt: refreshTokenExpiry()
  });
  return {
    accessToken: signAccessToken(user.id, user.role),
    refreshToken: refreshTokenRaw
  };
}

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

  const pair = await issueTokenPairForUser(user);
  return {
    accessToken: pair.accessToken,
    refreshTokenRaw: pair.refreshToken,
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
  // Strict less-than: a token whose expiresAt equals NOW exactly is
  // still considered valid for this microsecond. Closed interval
  // [issuedAt, expiresAt]. Difference vs strict-after-expiry is
  // sub-millisecond — picking `<` defends against the boundary case
  // of a freshly-issued token where expiresAt could collide with now
  // (e.g. test fixtures, clock skew).
  if (outcome.oldRow.expiresAt < now) {
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
      accessToken: signAccessToken(userRow.id, userRow.role)
    };
  }

  // Fresh rotation succeeded inside the TX above.
  return {
    kind: "rotated",
    accessToken: signAccessToken(userRow.id, userRow.role),
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

// ─── Sprint 9.T — self-service operations on /auth/me ────────────────

/**
 * Change the current user's password. Re-auth via `currentPassword`
 * is mandatory: matching it against the row's bcrypt hash gates the
 * rotation behind possession of the actual credential, so a stolen
 * access token alone can't lock the legitimate owner out.
 *
 * On success: ALL existing refresh tokens for this user are revoked
 * (forcing every other device/tab to re-login). The current session
 * is intentionally NOT auto-rotated here — the caller already has a
 * valid access token + refresh cookie; revoking-all + leaving the
 * current cookie in place means the next /auth/refresh on this
 * device will rotate cleanly via the standard path. Other devices
 * will land on /login.
 */
export async function changeOwnPassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
}): Promise<void> {
  const user = await findUserById(input.userId);
  if (!user) throw new TokenInvalidError("User not found.");
  if (!user.isActive) throw new ForbiddenError("Account is disabled.");

  const matches = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!matches) {
    // Reuse the same error shape as the login path so the FE error
    // handler renders "Email or password is incorrect" uniformly.
    throw new InvalidCredentialsError();
  }

  const newHash = await bcrypt.hash(input.newPassword, env.BCRYPT_COST);
  const updated = await updatePasswordHash(user.id, newHash);
  if (!updated) {
    throw new InternalError(
      `[auth] user ${user.id} disappeared mid-password-change`
    );
  }

  // Revoke every refresh token for this user. The bulk-revoke
  // backdates revoked_at past the grace window, so even a fresh
  // refresh attempt from another tab will fail. The CURRENT
  // session's refresh cookie is also revoked — that's intentional:
  // the FE will catch the next 401 and route the user back to
  // /login, which is correct UX after a password change.
  await revokeAllRefreshTokensForUser(user.id);
}

/**
 * Bulk-revoke every active refresh token for the current user.
 * Used by "Sign out everywhere" on /me. After this call, EVERY
 * device (including the one that initiated) will land on /login
 * on its next request.
 */
export async function signOutEverywhere(userId: string): Promise<void> {
  await revokeAllRefreshTokensForUser(userId);
}
