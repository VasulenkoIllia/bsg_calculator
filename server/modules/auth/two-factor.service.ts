/**
 * TOTP 2FA business logic (Phase 8 Stage 2).
 *
 * Setup → confirm → (login challenge) verify, plus disable, regenerate
 * backup codes, status, super-admin force-disable, and the helpers the
 * login flow uses to mint/validate the temp token + trusted devices.
 *
 * Security model:
 *   - The TOTP secret is AES-256-GCM-encrypted at rest (totp-crypto.ts).
 *   - Backup codes, the login temp token, and the trusted-device cookie
 *     token are all random + sha256-hashed (token-utils.ts) — only the
 *     hash is persisted; the raw is shown/sent once.
 *   - Re-auth (password + a current code) gates disable + regenerate so a
 *     stolen access token alone can't strip 2FA.
 */

import { createHash } from "node:crypto";
import bcrypt from "bcrypt";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { findUserById, revokeAllRefreshTokensForUser } from "./auth.repository";
import { issueTokenPairForUser } from "./auth.service";
import { generateRawToken, hashToken } from "../../shared/token-utils";
import { encryptTotpSecret, decryptTotpSecret } from "../../shared/totp-crypto";
import {
  ConflictError,
  ForbiddenError,
  InvalidCredentialsError,
  NotFoundError,
  TokenInvalidError,
  ValidationError
} from "../../shared/errors";
import type { User } from "../../db/schema";
import type { UserPublic } from "./auth.schemas";
import * as repo from "./two-factor.repository";

const TOTP_ISSUER = "BSG Pricing";
const MFA_TEMP_TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes
const TRUSTED_DEVICE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const BACKUP_CODE_COUNT = 10;

// ─── helpers ─────────────────────────────────────────────────────────

/**
 * sha256(UA + IP prefix). The prefix tolerates mobile-IP churn while
 * narrowing the shared-network surface for a stolen trusted-device cookie:
 * a /24 for IPv4 (was /16) and a /48 for IPv6. NOTE: this is defence-in-
 * depth only — the real trust anchor is the 256-bit cookie token (httpOnly,
 * Secure, SameSite=strict) whose hash is checked against `trusted_devices`;
 * the fingerprint cannot grant access on its own.
 */
export function computeFingerprint(userAgent: string, ip: string): string {
  const prefix = ip.includes(".")
    ? ip.split(".").slice(0, 3).join(".") // IPv4 — /24
    : ip.split(":").slice(0, 3).join(":"); // IPv6 — /48
  return createHash("sha256").update(`${userAgent}|${prefix}`).digest("hex");
}

/** Normalise a backup code for hashing/compare (strip dashes/space, lower). */
function normalizeBackupCode(code: string): string {
  return code.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

/** 10 one-time codes. Returns the display form + the sha256 hash to store. */
function generateBackupCodes(): { display: string; hash: string }[] {
  return Array.from({ length: BACKUP_CODE_COUNT }, () => {
    const raw = generateRawToken().replace(/[^a-z0-9]/gi, "").slice(0, 10).toLowerCase();
    const display = `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
    return { display, hash: hashToken(raw) };
  });
}

function isTotpCodeShape(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

// Accept the code from the previous, current, and next 30s step so a small
// clock drift between the server and the authenticator app doesn't cause
// spurious failures. (Replay within this ~90s window is bounded by the
// 10/min verify limiter; per-step replay tracking is a possible future
// hardening — see the security-review notes in decisions.md.)
authenticator.options = { window: 1 };

function verifyTotp(secretEncrypted: string, code: string): boolean {
  const secret = decryptTotpSecret(secretEncrypted);
  return authenticator.check(code.trim(), secret);
}

/**
 * Validate a login/disable code against either the current TOTP OR an
 * unused backup code. Consumes the backup code when `consume` is true.
 * Returns whether it matched (and via which path).
 */
async function verifyTotpOrBackup(
  user: User,
  code: string,
  consume: boolean
): Promise<boolean> {
  if (!user.totpSecretEncrypted) return false;
  if (isTotpCodeShape(code) && verifyTotp(user.totpSecretEncrypted, code)) {
    return true;
  }
  // Try a backup code.
  const row = await repo.findUnusedBackupCode(user.id, hashToken(normalizeBackupCode(code)));
  if (!row) return false;
  if (consume) {
    const ok = await repo.consumeBackupCode(row.id);
    if (!ok) return false; // lost a race — already consumed
  }
  return true;
}

// ─── status ──────────────────────────────────────────────────────────

export interface TotpStatus {
  enabled: boolean;
  backupCodesRemaining: number;
}

export async function getTotpStatus(userId: string): Promise<TotpStatus> {
  const user = await findUserById(userId);
  if (!user) throw new TokenInvalidError("User not found.");
  const enabled = user.totpEnabledAt !== null;
  return {
    enabled,
    backupCodesRemaining: enabled ? await repo.countUnusedBackupCodes(userId) : 0
  };
}

// ─── setup / confirm ─────────────────────────────────────────────────

/**
 * Begin enrolment: mint a fresh secret, store it PENDING (encrypted,
 * enabled_at NULL), and return the QR + manual key for the authenticator
 * app. Re-running before confirm just replaces the pending secret.
 */
export async function startTotpSetup(
  userId: string
): Promise<{ qrCode: string; manualKey: string }> {
  const user = await findUserById(userId);
  if (!user) throw new TokenInvalidError("User not found.");
  if (user.totpEnabledAt) {
    throw new ConflictError("TWO_FACTOR_ALREADY_ENABLED", "2FA is already enabled.");
  }
  const secret = authenticator.generateSecret();
  await repo.setPendingTotpSecret(userId, encryptTotpSecret(secret));
  const otpauth = authenticator.keyuri(user.email, TOTP_ISSUER, secret);
  const qrCode = await QRCode.toDataURL(otpauth);
  return { qrCode, manualKey: secret };
}

/**
 * Confirm enrolment: verify a code against the pending secret, activate
 * 2FA, and generate the 10 backup codes (returned ONCE).
 */
export async function confirmTotpSetup(
  userId: string,
  code: string
): Promise<{ backupCodes: string[] }> {
  const user = await findUserById(userId);
  if (!user) throw new TokenInvalidError("User not found.");
  if (user.totpEnabledAt) {
    throw new ConflictError("TWO_FACTOR_ALREADY_ENABLED", "2FA is already enabled.");
  }
  if (!user.totpSecretEncrypted) {
    throw new ConflictError(
      "TWO_FACTOR_SETUP_NOT_STARTED",
      "Start 2FA setup first (no pending secret)."
    );
  }
  if (!isTotpCodeShape(code) || !verifyTotp(user.totpSecretEncrypted, code)) {
    throw new ValidationError(
      [{ path: ["code"], message: "Invalid 6-digit code." }],
      "Invalid 2FA code"
    );
  }
  const codes = generateBackupCodes();
  await repo.replaceBackupCodes(
    userId,
    codes.map(c => c.hash)
  );
  await repo.activateTotp(userId);
  return { backupCodes: codes.map(c => c.display) };
}

// ─── disable / regenerate (re-auth required) ─────────────────────────

async function reauth(user: User, password: string, code: string): Promise<void> {
  const passOk = await bcrypt.compare(password, user.passwordHash);
  if (!passOk) throw new InvalidCredentialsError();
  const codeOk = await verifyTotpOrBackup(user, code, false);
  if (!codeOk) {
    throw new ValidationError(
      [{ path: ["code"], message: "Invalid code." }],
      "Invalid 2FA code"
    );
  }
}

/** Disable 2FA (re-auth: password + current code). Revokes all sessions. */
export async function disableTotp(input: {
  userId: string;
  password: string;
  code: string;
}): Promise<void> {
  const user = await findUserById(input.userId);
  if (!user) throw new TokenInvalidError("User not found.");
  if (!user.totpEnabledAt) {
    throw new ConflictError("TWO_FACTOR_NOT_ENABLED", "2FA is not enabled.");
  }
  await reauth(user, input.password, input.code);
  await repo.clearTotpSecret(user.id);
  await repo.deleteBackupCodes(user.id);
  await repo.deleteTrustedDevices(user.id);
  await revokeAllRefreshTokensForUser(user.id);
}

/** Replace the backup codes (re-auth: password + current code). */
export async function regenerateBackupCodes(input: {
  userId: string;
  password: string;
  code: string;
}): Promise<{ backupCodes: string[] }> {
  const user = await findUserById(input.userId);
  if (!user) throw new TokenInvalidError("User not found.");
  if (!user.totpEnabledAt) {
    throw new ConflictError("TWO_FACTOR_NOT_ENABLED", "2FA is not enabled.");
  }
  await reauth(user, input.password, input.code);
  const codes = generateBackupCodes();
  await repo.replaceBackupCodes(
    user.id,
    codes.map(c => c.hash)
  );
  return { backupCodes: codes.map(c => c.display) };
}

// ─── super-admin force-disable ───────────────────────────────────────

/** Recovery path: clear a user's 2FA entirely (no re-auth; admin action). */
export async function forceDisableTotp(targetUserId: string): Promise<UserPublic> {
  const user = await findUserById(targetUserId);
  if (!user) throw new NotFoundError("User");
  await repo.clearTotpSecret(user.id);
  await repo.deleteBackupCodes(user.id);
  await repo.deleteTrustedDevices(user.id);
  // Security review — also kill the target's active sessions, matching the
  // self-service disable. Without this, a force-disable (recovery for a lost
  // device) would leave any existing session minting access tokens.
  await revokeAllRefreshTokensForUser(user.id);
  // Reflect the now-cleared state (the loaded row still has the old flag).
  return toUserPublic2fa({ ...user, totpSecretEncrypted: null, totpEnabledAt: null });
}

// ─── login-flow helpers (used by auth.service.login) ─────────────────

/** Mint a 5-min single-use login temp token; returns the raw token. */
export async function mintMfaTempToken(userId: string): Promise<string> {
  const raw = generateRawToken();
  await repo.insertMfaTempToken({
    userId,
    tokenHash: hashToken(raw),
    expiresAt: new Date(Date.now() + MFA_TEMP_TOKEN_TTL_MS)
  });
  return raw;
}

/** Is this device a live trusted device for the user? (login fast-path) */
export async function isDeviceTrusted(input: {
  userId: string;
  deviceTokenRaw: string;
  fingerprintHash: string;
}): Promise<boolean> {
  const row = await repo.findAliveTrustedDevice({
    userId: input.userId,
    tokenHash: hashToken(input.deviceTokenRaw),
    fingerprintHash: input.fingerprintHash
  });
  return Boolean(row);
}

// ─── verify (the login second step) ──────────────────────────────────

export interface VerifyTotpResult {
  user: UserPublic;
  accessToken: string;
  refreshTokenRaw: string;
  /** Set only when `trustDevice` was requested — the raw cookie token. */
  trustedDeviceTokenRaw?: string;
}

/**
 * Complete the 2FA login step: resolve the (single-use) temp token,
 * validate the code (TOTP or backup), issue a real session, and
 * optionally register a trusted device.
 */
export async function verifyTotpLogin(input: {
  tempTokenRaw: string;
  code: string;
  trustDevice: boolean;
  fingerprintHash: string;
}): Promise<VerifyTotpResult> {
  const tokenHash = hashToken(input.tempTokenRaw);
  const temp = await repo.findAliveMfaTempToken(tokenHash);
  if (!temp) {
    throw new TokenInvalidError("2FA session expired. Please log in again.");
  }
  const user = await findUserById(temp.userId);
  if (!user) throw new TokenInvalidError("Token references a deleted user.");
  if (!user.isActive) throw new ForbiddenError("Account is disabled.");
  if (!user.totpEnabledAt || !user.totpSecretEncrypted) {
    // 2FA was disabled between login and verify — nothing to check.
    throw new ConflictError("TWO_FACTOR_NOT_ENABLED", "2FA is not enabled.");
  }

  const ok = await verifyTotpOrBackup(user, input.code, true);
  if (!ok) {
    // Wrong code — DON'T burn the temp token; let the user retry the same
    // session (the 5-min TTL + 10/min /verify limiter bound brute force).
    throw new ValidationError(
      [{ path: ["code"], message: "Invalid or already-used code." }],
      "Invalid 2FA code"
    );
  }

  // Code accepted — consume the temp token (single-use per successful login).
  await repo.deleteMfaTempToken(tokenHash);
  const pair = await issueTokenPairForUser(user);
  const result: VerifyTotpResult = {
    user: toUserPublic2fa(user),
    accessToken: pair.accessToken,
    refreshTokenRaw: pair.refreshToken
  };

  if (input.trustDevice) {
    const deviceRaw = generateRawToken();
    await repo.insertTrustedDevice({
      userId: user.id,
      tokenHash: hashToken(deviceRaw),
      fingerprintHash: input.fingerprintHash,
      expiresAt: new Date(Date.now() + TRUSTED_DEVICE_TTL_MS)
    });
    result.trustedDeviceTokenRaw = deviceRaw;
  }
  return result;
}

/** Public-shape projection incl. the 2FA flag. */
export function toUserPublic2fa(user: User): UserPublic {
  return {
    id: user.id,
    email: user.email,
    login: user.login,
    displayName: user.displayName,
    role: user.role,
    isActive: user.isActive,
    twoFactorEnabled: user.totpEnabledAt !== null
  };
}

export const TRUSTED_DEVICE_MAX_AGE_MS = TRUSTED_DEVICE_TTL_MS;
