/**
 * HTTP controllers for the TOTP 2FA endpoints (Phase 8 Stage 2). Thin
 * Zod-validate + dispatch adapters; logic lives in two-factor.service.
 */

import type { Request, Response } from "express";
import {
  REFRESH_COOKIE_NAME,
  REFRESH_COOKIE_PATH,
  TRUSTED_DEVICE_COOKIE_NAME,
  refreshCookieOptions,
  trustedDeviceCookieOptions
} from "./auth.cookies";
import {
  computeFingerprint,
  confirmTotpSetup,
  disableTotp,
  getTotpStatus,
  regenerateBackupCodes,
  startTotpSetup,
  verifyTotpLogin
} from "./two-factor.service";
import {
  regenerateBackupCodesRequestSchema,
  twoFactorConfirmRequestSchema,
  twoFactorDisableRequestSchema,
  twoFactorVerifyRequestSchema,
  type BackupCodesResponse,
  type TwoFactorSetupResponse,
  type TwoFactorStatusResponse
} from "./two-factor.schemas";
import type { LoginResponse } from "./auth.schemas";
import { TokenInvalidError } from "../../shared/errors";
import { auditActor } from "../../shared/audit-actor";
import { recordAdminAction } from "../admin-actions/admin-actions.service";

/** POST /auth/2fa/verify — login second step (no auth; tempToken is the credential). */
export async function verifyController(req: Request, res: Response): Promise<void> {
  const body = twoFactorVerifyRequestSchema.parse(req.body);
  const result = await verifyTotpLogin({
    tempTokenRaw: body.tempToken,
    code: body.code,
    trustDevice: body.trustDevice,
    fingerprintHash: computeFingerprint(req.get("user-agent") ?? "", req.ip ?? "")
  });

  res.cookie(REFRESH_COOKIE_NAME, result.refreshTokenRaw, refreshCookieOptions);
  if (result.trustedDeviceTokenRaw) {
    res.cookie(
      TRUSTED_DEVICE_COOKIE_NAME,
      result.trustedDeviceTokenRaw,
      trustedDeviceCookieOptions
    );
  }
  const payload: LoginResponse = {
    accessToken: result.accessToken,
    user: result.user
  };
  res.status(200).json(payload);
}

/** POST /auth/me/2fa/setup — begin enrolment. */
export async function setupController(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new TokenInvalidError();
  const payload: TwoFactorSetupResponse = await startTotpSetup(req.user.id);
  res.status(200).json(payload);
}

/** POST /auth/me/2fa/confirm — confirm + activate, return backup codes. */
export async function confirmController(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new TokenInvalidError();
  const body = twoFactorConfirmRequestSchema.parse(req.body);
  const payload: BackupCodesResponse = await confirmTotpSetup(req.user.id, body.code);
  await recordAdminAction({
    ...auditActor(req),
    actionType: "auth.2fa_enabled",
    targetType: "user",
    targetId: req.user.id
  });
  res.status(200).json(payload);
}

/** POST /auth/me/2fa/disable — disable (re-auth) + revoke sessions. */
export async function disableController(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new TokenInvalidError();
  const body = twoFactorDisableRequestSchema.parse(req.body);
  await disableTotp({
    userId: req.user.id,
    password: body.password,
    code: body.code
  });
  await recordAdminAction({
    ...auditActor(req),
    actionType: "auth.2fa_disabled",
    targetType: "user",
    targetId: req.user.id
  });
  // disable revoked all refresh tokens; clear both cookies so the next
  // request from this tab doesn't replay a dead session / trust.
  res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  res.clearCookie(TRUSTED_DEVICE_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  res.status(204).end();
}

/** POST /auth/me/2fa/backup-codes/regenerate — re-auth, return new codes. */
export async function regenerateController(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new TokenInvalidError();
  const body = regenerateBackupCodesRequestSchema.parse(req.body);
  const payload: BackupCodesResponse = await regenerateBackupCodes({
    userId: req.user.id,
    password: body.password,
    code: body.code
  });
  res.status(200).json(payload);
}

/** GET /auth/me/2fa — status. */
export async function statusController(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new TokenInvalidError();
  const payload: TwoFactorStatusResponse = await getTotpStatus(req.user.id);
  res.status(200).json(payload);
}
