/**
 * Sprint 9.O — invite-link endpoint wrappers.
 *
 * Two surfaces:
 *   - super_admin admin endpoints (mounted under /users/invites) —
 *     create / list / revoke. These go through the standard
 *     authenticated `apiClient`.
 *   - PUBLIC accept-invite endpoints (under /auth/invite/:token) —
 *     called by the unauthenticated AcceptInvitePage. The shared
 *     `apiClient` still works because requireAuth isn't mounted on
 *     these routes (the raw token IS the credential).
 */

import { apiClient } from "./client.js";
import type { PublicUser, UserRole } from "./types.js";

// ─── super_admin endpoints ──────────────────────────────────────────

export interface CreateInviteRequest {
  role: UserRole;
}

export interface CreateInviteResponse {
  id: string;
  role: UserRole;
  expiresAt: string;
  /** Absolute URL to copy + forward to the invitee. */
  link: string;
}

export interface InviteAdminRow {
  id: string;
  role: UserRole;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt: string;
  createdAt: string;
  createdByDisplayName: string;
  createdByEmail: string;
  acceptedUserId: string | null;
  acceptedUserDisplayName: string | null;
  acceptedUserEmail: string | null;
}

export async function createInvite(
  body: CreateInviteRequest
): Promise<CreateInviteResponse> {
  const { data } = await apiClient.post<CreateInviteResponse>(
    "/users/invites",
    body
  );
  return data;
}

export async function listInvites(): Promise<{ items: InviteAdminRow[] }> {
  const { data } = await apiClient.get<{ items: InviteAdminRow[] }>(
    "/users/invites"
  );
  return data;
}

export async function revokeInvite(id: string): Promise<void> {
  await apiClient.delete(`/users/invites/${encodeURIComponent(id)}`);
}

/**
 * Re-issue an invite — revokes the old token and returns a FRESH copyable
 * link (same role). Use when the link wasn't copied at creation: the raw
 * token is never stored, so a new token is the only way to get a link later.
 */
export async function reissueInvite(id: string): Promise<CreateInviteResponse> {
  const { data } = await apiClient.post<CreateInviteResponse>(
    `/users/invites/${encodeURIComponent(id)}/reissue`
  );
  return data;
}

// ─── Public endpoints (used by AcceptInvitePage) ────────────────────

export interface InvitePreview {
  role: UserRole;
  expiresAt: string;
}

export interface AcceptInviteRequest {
  email: string;
  login?: string;
  displayName: string;
  password: string;
}

export interface AcceptInviteResponse {
  accessToken: string;
  user: PublicUser;
}

export async function previewInvite(token: string): Promise<InvitePreview> {
  const { data } = await apiClient.get<InvitePreview>(
    `/auth/invite/${encodeURIComponent(token)}`
  );
  return data;
}

export async function acceptInvite(
  token: string,
  body: AcceptInviteRequest
): Promise<AcceptInviteResponse> {
  const { data } = await apiClient.post<AcceptInviteResponse>(
    `/auth/invite/${encodeURIComponent(token)}/accept`,
    body
  );
  return data;
}
