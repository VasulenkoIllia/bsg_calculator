/**
 * Sprint 9.O — password-reset-link endpoint wrappers.
 *
 * Mirror of api/invites.ts: super_admin issues a link; the public
 * /reset-password page consumes it. Two surfaces, two endpoints.
 */

import { apiClient } from "./client.js";
import type { PublicUser } from "./types.js";

// ─── super_admin endpoint (alternative to direct reset) ─────────────

export interface CreateResetLinkResponse {
  id: string;
  expiresAt: string;
  link: string;
}

export async function createPasswordResetLink(
  userId: string
): Promise<CreateResetLinkResponse> {
  const { data } = await apiClient.post<CreateResetLinkResponse>(
    `/users/${encodeURIComponent(userId)}/password-reset-link`
  );
  return data;
}

// ─── Public endpoints (used by ResetPasswordPage) ───────────────────

export interface ResetPreview {
  email: string;
  displayName: string;
  expiresAt: string;
}

export interface ConsumeResetResponse {
  accessToken: string;
  user: PublicUser;
}

export async function previewReset(token: string): Promise<ResetPreview> {
  const { data } = await apiClient.get<ResetPreview>(
    `/auth/password-reset/${encodeURIComponent(token)}`
  );
  return data;
}

export async function consumeReset(
  token: string,
  newPassword: string
): Promise<ConsumeResetResponse> {
  const { data } = await apiClient.post<ConsumeResetResponse>(
    `/auth/password-reset/${encodeURIComponent(token)}`,
    { newPassword }
  );
  return data;
}
