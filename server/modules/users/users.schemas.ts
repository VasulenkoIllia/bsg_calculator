/**
 * Users module — Zod request schemas + DTO types.
 *
 * The "public" user shape is re-used from the auth module so the
 * frontend gets a single source of truth for what a user looks like.
 */

import { z } from "zod";
import { USER_ROLES } from "../../db/schema";

export { userPublicSchema, type UserPublic } from "../auth/auth.schemas";

// ─── Request bodies ─────────────────────────────────────────────────

/**
 * Phase 8 Stage 1: admin user-management requests use `role` instead
 * of the legacy `isAdmin` boolean. Defaults to `user` (least
 * privileged tier) so an omitted field can never accidentally
 * elevate.
 */
export const createUserRequestSchema = z.object({
  email: z.string().email().max(254),
  login: z.string().min(1).max(64).optional(),
  password: z.string().min(8).max(128),
  displayName: z.string().max(120).default(""),
  role: z.enum(USER_ROLES).default("user")
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

export const updateUserRequestSchema = z
  .object({
    displayName: z.string().max(120).optional(),
    isActive: z.boolean().optional(),
    role: z.enum(USER_ROLES).optional()
  })
  .refine(data => Object.keys(data).length > 0, {
    message: "At least one field must be provided."
  });
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  newPassword: z.string().min(8).max(128)
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;
