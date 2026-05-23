/**
 * Sprint 9.U — admin audit log API client.
 *
 * Single endpoint today: GET /admin/audit-log (super_admin only,
 * paginated). The cursor is an opaque pair {id, createdAt} returned
 * by the server's previous response.
 */

import { apiClient } from "./client.js";

/**
 * Sprint 9.V audit fix M6 — single source of truth for the FE side
 * of the action-type vocabulary. Keep this `as const` array in
 * lockstep with the server's CHECK constraint
 * (`server/db/migrations/0013_admin_actions.sql`) and the schema's
 * `ADMIN_ACTION_TYPES` const. Adding a new value here without
 * adding to those will compile but fail at runtime when the new
 * row arrives from the server — Zod-narrowed `AdminActionType` on
 * the response would catch it as a parse error.
 */
export const ADMIN_ACTION_TYPES = [
  "user.created",
  "user.updated",
  "user.password_reset",
  "user.invite_created",
  "user.invite_revoked",
  "user.reset_link_created",
  "auth.invite_accepted",
  "auth.reset_consumed",
  "auth.password_changed",
  "auth.signed_out_everywhere",
  "document.deleted",
  "document.restored"
] as const;

export type AdminActionType = (typeof ADMIN_ACTION_TYPES)[number];

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

/**
 * Sprint 9.V audit fix M8 — human-friendly labels for the admin
 * audit log's `action_type` controlled vocabulary. Exhaustive
 * switch + `default: never` guard ensures every new value added to
 * `ADMIN_ACTION_TYPES` is also labelled here (TS compile error
 * otherwise).
 *
 * Lives in this api file (not src/shared/format.ts) because
 * `src/shared/**` is loaded by the server tsconfig, which would
 * then pull `api/admin-actions.ts` → `api/client.ts` → vite's
 * `import.meta.env` into the server build. Keeping the formatter
 * FE-side keeps server isolation clean.
 */
export function formatAdminActionType(type: AdminActionType): string {
  switch (type) {
    case "user.created":
      return "Created user";
    case "user.updated":
      return "Updated user";
    case "user.password_reset":
      return "Reset password (direct)";
    case "user.invite_created":
      return "Issued invite";
    case "user.invite_revoked":
      return "Revoked invite";
    case "user.reset_link_created":
      return "Issued reset link";
    case "auth.invite_accepted":
      return "Accepted invite";
    case "auth.reset_consumed":
      return "Consumed reset link";
    case "auth.password_changed":
      return "Changed own password";
    case "auth.signed_out_everywhere":
      return "Signed out everywhere";
    case "document.deleted":
      return "Deleted document";
    case "document.restored":
      return "Restored document";
    default: {
      const _exhaustive: never = type;
      return String(_exhaustive);
    }
  }
}
