/**
 * Users module — Zod request schemas + DTO types.
 *
 * The "public" user shape is re-used from the auth module so the
 * frontend gets a single source of truth for what a user looks like.
 */

import { z } from "zod";

export { userPublicSchema, type UserPublic } from "../auth/auth.schemas";

// ─── Request bodies ─────────────────────────────────────────────────

export const createUserRequestSchema = z.object({
  email: z.string().email().max(254),
  login: z.string().min(1).max(64).optional(),
  password: z.string().min(8).max(128),
  displayName: z.string().max(120).default(""),
  isAdmin: z.boolean().default(false)
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

export const updateUserRequestSchema = z
  .object({
    displayName: z.string().max(120).optional(),
    isActive: z.boolean().optional(),
    isAdmin: z.boolean().optional()
  })
  .refine(data => Object.keys(data).length > 0, {
    message: "At least one field must be provided."
  });
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  newPassword: z.string().min(8).max(128)
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
