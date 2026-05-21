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
  isActive: z.boolean()
});

export type UserPublic = z.infer<typeof userPublicSchema>;

export const loginResponseSchema = z.object({
  accessToken: z.string(),
  user: userPublicSchema
});

export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const refreshResponseSchema = z.object({
  accessToken: z.string()
});

export type RefreshResponse = z.infer<typeof refreshResponseSchema>;
