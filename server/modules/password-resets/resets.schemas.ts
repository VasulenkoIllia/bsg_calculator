/**
 * Sprint 9.O — Zod schemas for the password-reset-link flow.
 */

import { z } from "zod";

/**
 * super_admin → `POST /users/:id/password-reset-link` response.
 * Returns the one-time URL the operator copies and forwards. The
 * raw token only appears HERE; subsequent reads can't retrieve it.
 */
export const createResetLinkResponseSchema = z.object({
  id: z.string().uuid(),
  expiresAt: z.string(),
  link: z.string().url()
});
export type CreateResetLinkResponse = z.infer<typeof createResetLinkResponseSchema>;

/**
 * Public `GET /auth/password-reset/:token` preview body. Includes
 * the target user's email + display name so the FE can confirm
 * "Reset password for admin@bsg.test (Admin)" before the user
 * commits to a new password.
 */
export const resetPreviewSchema = z.object({
  email: z.string(),
  displayName: z.string(),
  expiresAt: z.string()
});
export type ResetPreview = z.infer<typeof resetPreviewSchema>;

/**
 * Public `POST /auth/password-reset/:token` body. Only the new
 * password — the user's identity is established by token ownership.
 */
export const consumeResetRequestSchema = z.object({
  newPassword: z.string().min(8).max(128)
});
export type ConsumeResetRequest = z.infer<typeof consumeResetRequestSchema>;
