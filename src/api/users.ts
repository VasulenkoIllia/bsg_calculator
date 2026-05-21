/**
 * Phase 8 Stage 3 — Users (admin/user-management) endpoint wrappers.
 *
 * Thin, typed functions over `apiClient`. Mirror the backend Zod
 * schemas in `server/modules/users/users.schemas.ts`:
 *
 *   GET    /api/v1/users           → { items: PublicUser[] }
 *   GET    /api/v1/users/:id       → PublicUser
 *   POST   /api/v1/users           → 201 PublicUser
 *   PATCH  /api/v1/users/:id       → 200 PublicUser
 *   POST   /api/v1/users/:id/reset-password → 200 PublicUser
 *
 * Every endpoint is `super_admin`-only on the server; calling from
 * a regular admin context will surface as `403 FORBIDDEN`. The
 * AdminUsersPage UI gates the navigation entry via the `hasRole`
 * helper so non-super_admin operators never hit a 403 in normal flow.
 */

import { apiClient } from "./client.js";
import type { PublicUser, UserRole } from "./types.js";

/**
 * Server `CreateUserRequest`. `role` defaults to `'user'` on the
 * server when omitted; we keep it required at this layer so callers
 * make an explicit choice (the modal form always picks a value).
 */
export interface CreateUserRequest {
  email: string;
  login?: string;
  password: string;
  displayName: string;
  role: UserRole;
}

/**
 * Server `UpdateUserRequest`. All fields optional; the server's
 * Zod `.refine` rejects an empty body with `VALIDATION_FAILED`.
 *
 * The three Phase 8 Stage 3 lock-out guards (self-block,
 * self-downgrade, last-super_admin) return `422 UNPROCESSABLE`
 * with codes the FE renders inline.
 */
export interface UpdateUserRequest {
  displayName?: string;
  isActive?: boolean;
  role?: UserRole;
}

export interface UsersListResponse {
  items: PublicUser[];
}

/**
 * GET /users — list all users for the management table.
 * Server returns them in `created_at DESC` order (newest first).
 */
export async function listUsers(): Promise<UsersListResponse> {
  const { data } = await apiClient.get<UsersListResponse>("/users");
  return data;
}

/**
 * GET /users/:id — single user lookup (not used by the current UI
 * but kept for completeness so future code paths can detail-fetch).
 */
export async function getUser(id: string): Promise<PublicUser> {
  const { data } = await apiClient.get<PublicUser>(`/users/${encodeURIComponent(id)}`);
  return data;
}

/**
 * POST /users — create a new user with a super-admin-set initial
 * password. The Stage 3 flow has the super_admin copy the password
 * out of the modal and forward it via Telegram/Slack to the new
 * user; we don't have SMTP so there's no email reset link.
 *
 * Conflict on duplicate email/login → `409 CONFLICT_USER_EXISTS`.
 */
export async function createUser(body: CreateUserRequest): Promise<PublicUser> {
  const { data } = await apiClient.post<PublicUser>("/users", body);
  return data;
}

/**
 * PATCH /users/:id — change displayName / isActive / role.
 *
 * The three lock-out guards (self-block, self-downgrade,
 * last-super_admin) return `422 UNPROCESSABLE` so the modal can
 * keep its current state and show the inline error.
 */
export async function patchUser(
  id: string,
  patch: UpdateUserRequest
): Promise<PublicUser> {
  const { data } = await apiClient.patch<PublicUser>(
    `/users/${encodeURIComponent(id)}`,
    patch
  );
  return data;
}

/**
 * POST /users/:id/reset-password — super_admin sets a new password
 * for another user. Returns the updated `PublicUser` (no password
 * surfaces on the wire — the caller-supplied plaintext stays only
 * client-side, the modal then closes after success).
 */
export async function resetUserPassword(
  id: string,
  newPassword: string
): Promise<PublicUser> {
  const { data } = await apiClient.post<PublicUser>(
    `/users/${encodeURIComponent(id)}/reset-password`,
    { newPassword }
  );
  return data;
}
