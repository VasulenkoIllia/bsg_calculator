/**
 * Sprint 9.O — Zod schemas for the invite-link flow.
 *
 * Two surface boundaries:
 *   - super_admin create / list / revoke (auth required)
 *   - public accept (no auth — the raw token IS the credential)
 *
 * Field constraints mirror the existing users schemas so the
 * downstream user creation in `createUserFromInvite` doesn't need
 * a second round of validation.
 */

import { z } from "zod";
import { INVITE_ROLES, USER_ROLES } from "../../db/schema";

// ─── Create-invite (super_admin) ────────────────────────────────────

/**
 * The body is tiny: super_admin picks ONLY the role. Email + login
 * + display name + password are entered by the invitee on
 * /accept-invite — per operator brief.
 */
export const createInviteRequestSchema = z.object({
  role: z.enum(INVITE_ROLES)
});
export type CreateInviteRequest = z.infer<typeof createInviteRequestSchema>;

// ─── Public preview of an invite (no auth) ──────────────────────────

/**
 * What we return from `GET /auth/invite/:token`. Just role + the
 * expiry timestamp so the FE shows "You're invited as Admin —
 * link expires in 23h". We deliberately do NOT echo the inviter's
 * email back to the public route — that's a small information leak.
 */
export const invitePreviewSchema = z.object({
  role: z.enum(USER_ROLES),
  expiresAt: z.string()
});
export type InvitePreview = z.infer<typeof invitePreviewSchema>;

// ─── Accept-invite (public) ─────────────────────────────────────────

/**
 * The invitee fills in everything. Mirrors `createUserRequestSchema`
 * minus the role (server reads role from the invite row).
 */
export const acceptInviteRequestSchema = z.object({
  email: z.string().email().max(254),
  login: z
    .string()
    .min(1)
    .max(64)
    .optional(),
  displayName: z.string().min(1).max(120),
  password: z.string().min(8).max(128)
});
export type AcceptInviteRequest = z.infer<typeof acceptInviteRequestSchema>;

// ─── Admin-side invite list row ─────────────────────────────────────

/**
 * Public shape of one row in the super_admin "Pending invites" panel.
 * `acceptedUser*` is populated only when status === 'accepted'; the
 * Zod refine could enforce that but the FE renders defensively
 * either way.
 */
export const inviteAdminRowSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(USER_ROLES),
  status: z.enum(["pending", "accepted", "revoked", "expired"]),
  expiresAt: z.string(),
  createdAt: z.string(),
  createdByDisplayName: z.string(),
  createdByEmail: z.string(),
  acceptedUserId: z.string().uuid().nullable(),
  acceptedUserDisplayName: z.string().nullable(),
  acceptedUserEmail: z.string().nullable()
});
export type InviteAdminRow = z.infer<typeof inviteAdminRowSchema>;

// ─── Create-invite response ─────────────────────────────────────────

/**
 * The create response carries the ONE-TIME raw token (so the
 * super_admin can copy it) plus a pre-built link the FE can show
 * with a "Copy" button. Subsequent reads from `listInvites` will
 * NOT include the raw token — we sha256-hash at rest.
 */
export const createInviteResponseSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(USER_ROLES),
  expiresAt: z.string(),
  /**
   * Absolute URL the super_admin pastes into Telegram/Slack.
   * Format: `${APP_PUBLIC_URL}/accept-invite?token=<raw>`.
   */
  link: z.string().url()
});
export type CreateInviteResponse = z.infer<typeof createInviteResponseSchema>;
