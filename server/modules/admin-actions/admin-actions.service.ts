/**
 * Sprint 9.U — admin_actions service.
 *
 * Public surface:
 *   - recordAdminAction({ actor, actionType, targetType, targetId, meta })
 *       Synchronous; fails loudly. Call AFTER the privileged action
 *       commits — if the action itself failed there's nothing to log.
 *   - listAdminActions({ ... }) — paginated super_admin listing.
 *
 * The actor is supplied as the full `User` row (or a {id, displayName,
 * email} triple) so callers don't have to do their own user lookup —
 * by the time you're here you've already loaded the actor.
 */

import { logger } from "../../middleware/logger";
import { parseDtoOrInternalError } from "../../shared/dto-parse";
import { findUserById } from "../users/users.repository";
import type { DbOrTx } from "../../db/client";
import type {
  AdminAction,
  AdminActionTargetType,
  AdminActionType
} from "../../db/schema";
import {
  insertAdminAction,
  listAdminActions as listAdminActionsRepo,
  type ListAdminActionsArgs
} from "./admin-actions.repository";
import {
  adminActionPublicSchema,
  type AdminActionPublic
} from "./admin-actions.schemas";

// ────────────────────────────────────────────────────────────────────
// Write — recordAdminAction
// ────────────────────────────────────────────────────────────────────

export interface RecordAdminActionInput {
  /**
   * The acting user's id. Pass `null` for actor-less system actions
   * (none today, but the schema supports it). The helper loads the
   * row to denormalise `displayName` + `email` at write-time so the
   * audit listing renders without a JOIN later.
   */
  actorUserId: string | null;
  actionType: AdminActionType;
  targetType?: AdminActionTargetType;
  targetId?: string;
  meta?: Record<string, unknown>;
  /** Optional transaction handle — pass when called from inside a tx. */
  tx?: DbOrTx;
}

/**
 * Append an entry to the audit log. Failures are logged + swallowed
 * so a logging glitch can't roll back the privileged action that
 * just succeeded. Audit trail completeness is best-effort; if a
 * write somehow fails the operator brief is "fix the log infra"
 * rather than "block the user".
 */
export async function recordAdminAction(
  input: RecordAdminActionInput
): Promise<void> {
  try {
    let actorDisplayName = "system";
    let actorEmail = "system@local";
    if (input.actorUserId) {
      const user = await findUserById(input.actorUserId);
      if (user) {
        actorDisplayName = user.displayName;
        actorEmail = user.email;
      }
    }
    await insertAdminAction(
      {
        actorUserId: input.actorUserId,
        actorDisplayName,
        actorEmail,
        actionType: input.actionType,
        targetType: input.targetType ?? null,
        targetId: input.targetId ?? null,
        meta: input.meta ?? {}
      },
      input.tx
    );
  } catch (err) {
    logger.error(
      {
        err: (err as Error).message,
        actionType: input.actionType,
        actorId: input.actorUserId,
        targetId: input.targetId ?? null
      },
      "[admin-actions] failed to record audit entry — privileged action succeeded but log write failed"
    );
  }
}

// ────────────────────────────────────────────────────────────────────
// Read — listAdminActions
// ────────────────────────────────────────────────────────────────────

function toPublic(row: AdminAction): AdminActionPublic {
  return parseDtoOrInternalError(
    adminActionPublicSchema,
    {
      id: row.id,
      actorUserId: row.actorUserId,
      actorDisplayName: row.actorDisplayName,
      actorEmail: row.actorEmail,
      actionType: row.actionType,
      targetType: row.targetType,
      targetId: row.targetId,
      meta: row.meta,
      createdAt: row.createdAt.toISOString()
    },
    "admin-actions.toPublic"
  );
}

export interface AdminActionListPage {
  items: AdminActionPublic[];
  /** Opaque cursor for the next page; null when no more rows. */
  nextCursor: { id: string; createdAt: string } | null;
}

export async function listAdminActions(
  args: ListAdminActionsArgs
): Promise<AdminActionListPage> {
  // Fetch one extra to determine whether more rows exist beyond this
  // page. Mirrors the pattern used by every other listing endpoint.
  const rows = await listAdminActionsRepo({
    ...args,
    limit: args.limit + 1
  });
  const hasMore = rows.length > args.limit;
  const items = hasMore ? rows.slice(0, args.limit) : rows;
  const tail = items[items.length - 1];
  return {
    items: items.map(toPublic),
    nextCursor:
      hasMore && tail
        ? { id: tail.id, createdAt: tail.createdAt.toISOString() }
        : null
  };
}
