/**
 * Zod request/response schemas for the auth module.
 *
 * Used by controllers to validate input AND by the API DTO type
 * exports the frontend imports from `src/lib/api/auth.ts`.
 */

import { z } from "zod";
import { USER_ROLES } from "../../db/schema";

// ─── Request bodies ─────────────────────────────────────────────────

export const loginRequestSchema = z.object({
  // `identifier` accepts either `users.email` or `users.login`.
  // Backend dispatches on the presence of `@`.
  identifier: z.string().min(1).max(254).trim(),
  password: z.string().min(1).max(128)
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

// ─── Response bodies ────────────────────────────────────────────────

/**
 * Phase 8 Stage 1: `role` replaces `isAdmin`. The hierarchical enum
 * (`user` ⊂ `admin` ⊂ `super_admin`) is mirrored on the frontend
 * (src/api/types.ts) so a stale token shape on either side surfaces
 * as a Zod error rather than silent corruption.
 */
export const userPublicSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  login: z.string().nullable(),
  displayName: z.string(),
  role: z.enum(USER_ROLES),
  isActive: z.boolean(),
  // Phase 8 Stage 2 — whether TOTP 2FA is active for this user. Drives the
  // /me cabinet status + the admin "Disable 2FA" affordance.
  twoFactorEnabled: z.boolean()
});

export type UserPublic = z.infer<typeof userPublicSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  user: userPublicSchema
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

/**
 * Phase 8 Stage 2 — alternative /auth/login response when the account
 * has 2FA enabled (and the request isn't from a trusted device). No
 * session is issued; the client posts `tempToken` + a code to
 * /auth/2fa/verify. Status is still 200 — the FE branches on the body.
 */
export const twoFactorChallengeResponseSchema = z.object({
  twoFactorRequired: z.literal(true),
  tempToken: z.string()
});

export type TwoFactorChallengeResponse = z.infer<
  typeof twoFactorChallengeResponseSchema
>;

export const refreshResponseSchema = z.object({
  accessToken: z.string()
});

export type RefreshResponse = z.infer<typeof refreshResponseSchema>;

// ─── Sprint 9.T — self-service password change + sign-out everywhere

/**
 * `/me/password` request body. Re-auth via `currentPassword` is
 * mandatory — without it, an XSS that captures an access token could
 * permanently lock the legitimate owner out by setting a new
 * password. Matching `currentPassword` against the row's bcrypt hash
 * gates the rotation behind possession of the actual credential, not
 * just session theft.
 */
export const changeOwnPasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128)
});

export type ChangeOwnPasswordRequest = z.infer<
  typeof changeOwnPasswordRequestSchema
>;
