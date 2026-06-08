/**
 * Sprint 9.O — password-reset-link service.
 *
 * Three operations:
 *   - `createResetLink` (super_admin) — for an existing user_id,
 *     issue a one-time link `${APP_PUBLIC_URL}/reset-password?token=`.
 *     The user's old password keeps working until the token is
 *     consumed (we DON'T revoke refresh tokens at issue-time per the
 *     original Phase 8 spec; revocation happens at consume-time).
 *   - `previewReset` (public) — token → target user's email +
 *     display name + expiresAt for the /reset-password page header.
 *   - `consumeReset` (public) — token + newPassword → updates the
 *     hash + marks the token used + revokes ALL refresh tokens for
 *     the user (so any active session is forced to re-login with
 *     the new password) + returns an auto-login token pair.
 *
 * TTL is 1 hour — much tighter than invite (24h) because reset is
 * a higher-stakes operation on an already-active account.
 */

import bcrypt from "bcrypt";
import { env } from "../../config/env";
import {
  ConflictError,
  InternalError,
  NotFoundError
} from "../../shared/errors";
import { findUserById } from "../users/users.repository";
import { revokeAllRefreshTokensForUser } from "../auth/auth.repository";
import { issueTokenPairForUser } from "../auth/auth.service";
import type { UserPublic } from "../auth/auth.schemas";
import { updatePasswordHash } from "../users/users.repository";
import {
  createPasswordReset,
  findAliveResetByRawToken,
  markResetUsed
} from "./resets.repository";
import type {
  CreateResetLinkResponse,
  ResetPreview
} from "./resets.schemas";

/**
 * Reset links are short-lived — 1 hour is enough for a super_admin
 * to copy + forward via Telegram/Slack, but tight enough that a
 * leaked URL rotates out quickly.
 */
const RESET_TTL_HOURS = 1;

function buildResetLink(rawToken: string): string {
  const base = env.APP_PUBLIC_URL.replace(/\/$/, "");
  return `${base}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

export async function createResetLink(
  userId: string,
  createdByUserId: string
): Promise<CreateResetLinkResponse> {
  // Target user must exist + be active. We could allow issuing for
  // a blocked user (recovery path), but the explicit `isActive`
  // check matches the rest of the admin surface — a blocked user
  // should be unblocked first.
  const target = await findUserById(userId);
  if (!target) throw new NotFoundError("User");
  if (!target.isActive) {
    throw new ConflictError(
      "USER_BLOCKED",
      "Cannot issue a password reset for a blocked user. Unblock first."
    );
  }
  // Sprint 9.O audit fix M3 — block cross-super_admin resets.
  // Without this guard, super_admin A could mint a reset link for
  // super_admin B and silently take over B's account. The only
  // legitimate super_admin reset is self-reset (when they're already
  // logged in and want to change their own password via this flow
  // instead of the standard /auth/me path). Cross-super_admin
  // resets must go through manual DB intervention (auditable in
  // the SQL log) rather than this in-app surface.
  if (target.role === "super_admin" && target.id !== createdByUserId) {
    throw new ConflictError(
      "RESET_FORBIDDEN_PEER_SUPER_ADMIN",
      "Cannot reset another super-admin's password via the in-app flow. " +
        "Coordinate directly with the target super-admin, or reset via DB."
    );
  }
  const { row, rawToken } = await createPasswordReset({
    userId,
    createdByUserId,
    ttlHours: RESET_TTL_HOURS
  });
  return {
    id: row.id,
    expiresAt: row.expiresAt.toISOString(),
    link: buildResetLink(rawToken)
  };
}

export async function previewReset(rawToken: string): Promise<ResetPreview> {
  const reset = await findAliveResetByRawToken(rawToken);
  // Generic 404 — never tell the public caller WHICH state the
  // token is in (unknown vs expired vs used).
  if (!reset) throw new NotFoundError("Reset");
  const user = await findUserById(reset.userId);
  if (!user) {
    // User got deleted between issue + use. The CASCADE FK would
    // also have nuked the reset row, but defensive.
    throw new NotFoundError("Reset");
  }
  return {
    email: user.email,
    displayName: user.displayName,
    expiresAt: reset.expiresAt.toISOString()
  };
}

/**
 * Consume the reset token: update the user's password hash, mark
 * the token used, revoke ALL existing refresh tokens for that user
 * (so any active session is forced to re-login), and return an
 * auto-login token pair for the just-reset user.
 */
export async function consumeReset(
  rawToken: string,
  newPassword: string
): Promise<{
  accessToken: string;
  refreshTokenRaw: string;
  user: UserPublic;
}> {
  const reset = await findAliveResetByRawToken(rawToken);
  if (!reset) throw new NotFoundError("Reset");

  const user = await findUserById(reset.userId);
  if (!user || !user.isActive) {
    // Blocked / deleted between issue + consume.
    throw new NotFoundError("Reset");
  }

  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_COST);

  // Mark the token used FIRST via the optimistic guard. If two
  // concurrent /reset-password calls land with the same raw
  // token, only one wins the UPDATE; the loser gets 409.
  const used = await markResetUsed(reset.id);
  if (!used) {
    throw new ConflictError(
      "RESET_ALREADY_USED",
      "This reset link has already been used. Ask for a new one."
    );
  }

  const updated = await updatePasswordHash(user.id, passwordHash);
  if (!updated) {
    // Shouldn't happen (user was found above + reset row is freshly
    // marked used). Surface as a server-side bug.
    throw new InternalError(
      `[resets] user ${user.id} disappeared mid-reset (after token consumed)`
    );
  }

  // Revoke EVERY active refresh token for this user so any device
  // that was logged-in with the OLD password is forced to re-login.
  // The auto-login pair below is fresh for the device that just
  // consumed the reset, not propagated to other devices.
  await revokeAllRefreshTokensForUser(user.id);

  const tokens = await issueTokenPairForUser(updated);
  return {
    accessToken: tokens.accessToken,
    refreshTokenRaw: tokens.refreshToken,
    user: {
      id: updated.id,
      email: updated.email,
      login: updated.login,
      displayName: updated.displayName,
      role: updated.role,
      isActive: updated.isActive,
      // Phase 8 Stage 2 — TOTP 2FA active flag.
      twoFactorEnabled: updated.totpEnabledAt !== null
    }
  };
}
