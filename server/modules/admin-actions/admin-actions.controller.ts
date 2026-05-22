/**
 * Sprint 9.U — admin_actions HTTP controllers.
 *
 * Single endpoint: GET /api/v1/admin/audit-log (super_admin only).
 * Paginated via opaque cursor (id + created_at pair), optional
 * filters on action_type + actor.
 */

import type { Request, Response } from "express";
import { listAdminActions } from "./admin-actions.service";
import { listAdminActionsQuerySchema } from "./admin-actions.schemas";

export async function listAdminActionsController(
  req: Request,
  res: Response
): Promise<void> {
  const query = listAdminActionsQuerySchema.parse(req.query);
  const page = await listAdminActions(query);
  res.status(200).json(page);
}
