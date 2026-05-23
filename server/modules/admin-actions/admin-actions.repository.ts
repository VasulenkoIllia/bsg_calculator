/**
 * Sprint 9.U — admin_actions data access.
 *
 * Append-only by design: the only writes are `recordAdminAction`,
 * the only reads are `listAdminActions` (super_admin pagination).
 * No update / delete surface — audit logs are tamper-resistant.
 */

import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db, type DbOrTx } from "../../db/client";
import { adminActions, type AdminAction } from "../../db/schema";
import type { AdminActionTargetType, AdminActionType } from "../../db/schema";

export interface InsertAdminActionInput {
  actorUserId: string | null;
  actorDisplayName: string;
  actorEmail: string;
  actionType: AdminActionType;
  targetType: AdminActionTargetType | null;
  targetId: string | null;
  meta: Record<string, unknown>;
}

export async function insertAdminAction(
  input: InsertAdminActionInput,
  tx: DbOrTx = db
): Promise<AdminAction> {
  const [row] = await tx.insert(adminActions).values(input).returning();
  if (!row) {
    throw new Error("[admin-actions] insert returned no row");
  }
  return row;
}

export interface ListAdminActionsArgs {
  limit: number;
  /** Pagination cursor — id of the row from the previous page's tail. */
  cursorId?: string;
  /** Pagination cursor — created_at of the cursor row (paired with id). */
  cursorCreatedAt?: Date;
  /** Optional filter — exact match on action_type. */
  actionType?: AdminActionType;
  /** Optional filter — exact match on actor_user_id. */
  actorUserId?: string;
  /** Sprint 9.X.C — exact match on target_type. */
  targetType?: AdminActionTargetType;
  /**
   * Sprint 9.X.C — narrow to rows whose target is a document OR
   * calc_config belonging to this company. Resolved via two EXISTS
   * subqueries because:
   *   - document targets use target_id = documents.number (text)
   *   - calc_config targets use target_id = calculator_configs.id (uuid as text)
   *   - user / invite / reset targets don't have a company → excluded
   *     by the OR (they can't match either subquery)
   */
  companyId?: string;
}

export async function listAdminActions(
  args: ListAdminActionsArgs
): Promise<AdminAction[]> {
  const conditions = [];

  if (args.actionType) {
    conditions.push(eq(adminActions.actionType, args.actionType));
  }
  if (args.actorUserId) {
    conditions.push(eq(adminActions.actorUserId, args.actorUserId));
  }
  if (args.targetType) {
    conditions.push(eq(adminActions.targetType, args.targetType));
  }
  if (args.companyId) {
    // Sprint 9.X.C — company filter via EXISTS. Both subqueries are
    // parameterised via Drizzle's sql template tags so the companyId
    // can't be injected. The text/uuid casts mirror how target_id is
    // stored: documents persist BSG-XXX as text; calc_configs persist
    // the UUID as text. The casts are explicit to avoid an implicit
    // "text = uuid" comparison error from the planner.
    conditions.push(
      sql`(
        EXISTS (
          SELECT 1 FROM documents d
          WHERE d.number = ${adminActions.targetId}
            AND d.company_id = ${args.companyId}
            AND ${adminActions.targetType} = 'document'
        )
        OR EXISTS (
          SELECT 1 FROM calculator_configs c
          WHERE c.id::text = ${adminActions.targetId}
            AND c.company_id = ${args.companyId}
            AND ${adminActions.targetType} = 'calc_config'
        )
      )`
    );
  }
  // Cursor: (created_at DESC, id DESC) — strict-less-than the cursor
  // pair. The (created_at DESC, id DESC) ordering means "older rows
  // after" — so we want rows where created_at < cursor OR
  // (created_at = cursor AND id < cursor_id).
  if (args.cursorCreatedAt && args.cursorId) {
    conditions.push(
      sql`(${adminActions.createdAt}, ${adminActions.id}) < (${args.cursorCreatedAt}, ${args.cursorId})`
    );
  }

  return db
    .select()
    .from(adminActions)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(adminActions.createdAt), desc(adminActions.id))
    .limit(args.limit);
}
