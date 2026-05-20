/**
 * Zod request/response schemas for the auth module.
 *
 * Used by controllers to validate input AND by the API DTO type
 * exports the frontend imports from `src/lib/api/auth.ts`.
 */

import { z } from "zod";

// ─── Request bodies ─────────────────────────────────────────────────

export const loginRequestSchema = z.object({
  // `identifier` accepts either `users.email` or `users.login`.
  // Backend dispatches on the presence of `@`.
  identifier: z.string().min(1).max(254).trim(),
  password: z.string().min(1).max(128)
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

// ─── Response bodies ────────────────────────────────────────────────

export const userPublicSchema = z.object({
  id: z.string().uuid(),
  email: z.string(),
  login: z.string().nullable(),
  displayName: z.string(),
  isAdmin: z.boolean(),
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
