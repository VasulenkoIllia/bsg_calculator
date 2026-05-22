/**
 * Sprint 9.U — admin audit log API client.
 *
 * Single endpoint today: GET /admin/audit-log (super_admin only,
 * paginated). The cursor is an opaque pair {id, createdAt} returned
 * by the server's previous response.
 */

import { apiClient } from "./client.js";

export type AdminActionType =
  | "user.created"
  | "user.updated"
  | "user.password_reset"
  | "user.invite_created"
  | "user.invite_revoked"
  | "user.reset_link_created"
  | "auth.invite_accepted"
  | "auth.reset_consumed"
  | "auth.password_changed"
  | "auth.signed_out_everywhere"
  | "document.deleted"
  | "document.restored";

export type AdminActionTargetType =
  | "user"
  | "document"
  | "calc_config"
  | "invite"
  | "reset";

export interface AdminAction {
  id: string;
  actorUserId: string | null;
  actorDisplayName: string;
  actorEmail: string;
  actionType: AdminActionType;
  targetType: AdminActionTargetType | null;
  targetId: string | null;
  meta: Record<string, unknown>;
  createdAt: string;
}

export interface AdminActionsPage {
  items: AdminAction[];
  nextCursor: { id: string; createdAt: string } | null;
}

export interface ListAdminActionsParams {
  limit?: number;
  cursorId?: string;
  cursorCreatedAt?: string;
  actionType?: AdminActionType;
  actorUserId?: string;
}

export async function listAdminActions(
  params: ListAdminActionsParams = {}
): Promise<AdminActionsPage> {
  const { data } = await apiClient.get<AdminActionsPage>("/admin/audit-log", {
    params
  });
  return data;
}
