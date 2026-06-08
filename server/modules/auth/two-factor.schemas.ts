/**
 * Zod request schemas for the TOTP 2FA endpoints (Phase 8 Stage 2).
 */

import { z } from "zod";

/** A 6-digit TOTP OR a backup code (e.g. "abcde-fghij"). */
const codeField = z.string().min(1).max(32).trim();

/** POST /auth/2fa/verify — the login second step. */
export const twoFactorVerifyRequestSchema = z.object({
  tempToken: z.string().min(1).max(128),
  code: codeField,
  trustDevice: z.boolean().optional().default(false)
});
export type TwoFactorVerifyRequest = z.infer<typeof twoFactorVerifyRequestSchema>;

/** POST /auth/me/2fa/confirm — finish enrolment with the first code. */
export const twoFactorConfirmRequestSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "Must be a 6-digit code")
});
export type TwoFactorConfirmRequest = z.infer<typeof twoFactorConfirmRequestSchema>;

/** POST /auth/me/2fa/disable — re-auth: password + a current code. */
export const twoFactorDisableRequestSchema = z.object({
  password: z.string().min(1).max(128),
  code: codeField
});
export type TwoFactorDisableRequest = z.infer<typeof twoFactorDisableRequestSchema>;

/** POST /auth/me/2fa/backup-codes/regenerate — re-auth like disable. */
export const regenerateBackupCodesRequestSchema = twoFactorDisableRequestSchema;
export type RegenerateBackupCodesRequest = TwoFactorDisableRequest;

// ─── Response shapes (for typing the controller + FE mirror) ─────────

export const twoFactorSetupResponseSchema = z.object({
  qrCode: z.string(), // data:image/png;base64,...
  manualKey: z.string() // base32 secret for manual entry
});
export type TwoFactorSetupResponse = z.infer<typeof twoFactorSetupResponseSchema>;

export const backupCodesResponseSchema = z.object({
  backupCodes: z.array(z.string())
});
export type BackupCodesResponse = z.infer<typeof backupCodesResponseSchema>;

export const twoFactorStatusResponseSchema = z.object({
  enabled: z.boolean(),
  backupCodesRemaining: z.number().int().nonnegative()
});
export type TwoFactorStatusResponse = z.infer<typeof twoFactorStatusResponseSchema>;
