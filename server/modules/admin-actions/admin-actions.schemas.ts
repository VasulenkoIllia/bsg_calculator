/**
 * Sprint 9.U — Zod schemas for the admin_actions module.
 *
 * `adminActionPublicSchema` is what GET /admin/audit-log emits and
 * what the FE narrows to. `listAdminActionsQuerySchema` validates
 * the query-string filters/cursor.
 */

import { z } from "zod";
import { ADMIN_ACTION_TYPES } from "../../db/schema";

export const adminActionTargetTypeSchema = z
  .enum(["user", "document", "calc_config", "invite", "reset"])
  .nullable();

export const adminActionPublicSchema = z.object({
  id: z.string().uuid(),
  /** Null when the acting user has been deleted (FK SET NULL). */
  actorUserId: z.string().uuid().nullable(),
  actorDisplayName: z.string(),
  actorEmail: z.string(),
  actionType: z.enum(ADMIN_ACTION_TYPES),
  targetType: adminActionTargetTypeSchema,
  targetId: z.string().nullable(),
  meta: z.record(z.unknown()),
  createdAt: z.string()
});

export type AdminActionPublic = z.infer<typeof adminActionPublicSchema>;

export const listAdminActionsQuerySchema = z.object({
  /** Page size — default 50, max 200. */
  limit: z.coerce.number().int().min(1).max(200).default(50),
  /** Opaque cursor — id from the previous page's tail. */
  cursorId: z.string().uuid().optional(),
  /** Opaque cursor — created_at from the previous page's tail. */
  cursorCreatedAt: z.coerce.date().optional(),
  /** Filter by action type (controlled enum). */
  actionType: z.enum(ADMIN_ACTION_TYPES).optional(),
  /** Filter by actor user id. */
  actorUserId: z.string().uuid().optional()
});

export type ListAdminActionsQuery = z.infer<typeof listAdminActionsQuerySchema>;
