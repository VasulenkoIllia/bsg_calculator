/**
 * HTTP controllers for the calculator-configs module.
 *
 * Thin Zod-validate + dispatch-to-service adapters. Auth is handled
 * by requireAuth middleware at the route level; the controller pulls
 * `req.user.id` for the audit column on POST.
 */

import type { Request, Response } from "express";
import {
  decodeSortedCursor,
  encodeSortKey,
  parseSortQuery
} from "../../shared/sorted-pagination";
import { parseUuidParam } from "../../shared/uuid-param";
import { TokenInvalidError } from "../../shared/errors";
import { auditActor } from "../../shared/audit-actor";
import { recordAdminAction } from "../admin-actions/admin-actions.service";
import { calculatorConfigSortFields } from "./calculator-configs.repository";
import {
  createCalculatorConfigSchema,
  listCalculatorConfigsQuerySchema,
  updateCalculatorConfigSchema
} from "./calculator-configs.schemas";
import {
  createCalculatorConfig,
  deleteCalculatorConfigById,
  getCalculatorConfig,
  listCalculatorConfigsPage,
  updateCalculatorConfigById
} from "./calculator-configs.service";
import { syncCalculatorConfigToHubspot } from "./sync.service";

export async function listController(req: Request, res: Response): Promise<void> {
  const query = listCalculatorConfigsQuerySchema.parse(req.query);
  // Sprint 6.8: per-column sort. The cursor encodes the sort spec it
  // was minted under so a mid-pagination `?sort=` switch surfaces as
  // a 400 (forces the frontend to reset to page 1).
  const sort = parseSortQuery(query.sort, calculatorConfigSortFields, {
    field: "createdAt",
    dir: "desc"
  });
  const cursor = decodeSortedCursor(query.cursor, encodeSortKey(sort));
  const page = await listCalculatorConfigsPage({
    companyId: query.companyId,
    hubspotDealId: query.hubspotDealId,
    showAll: query.showAll,
    q: query.q,
    sort,
    cursor,
    limit: query.limit
  });
  res.status(200).json(page);
}

export async function getController(req: Request, res: Response): Promise<void> {
  const id = parseUuidParam(req, "id");
  const config = await getCalculatorConfig(id);
  res.status(200).json(config);
}

export async function createController(req: Request, res: Response): Promise<void> {
  // requireAuth has already set req.user; the TokenInvalidError here
  // is defensive — should never fire in practice.
  if (!req.user) throw new TokenInvalidError();
  const body = createCalculatorConfigSchema.parse(req.body);
  const created = await createCalculatorConfig(body, req.user.id);
  // Sprint 9.X.B — audit log. companyId in meta enables the company
  // filter on /audit-log (Sprint 9.X.C). The calc's `title` may be
  // null (untitled drafts) — logged as null in that case.
  await recordAdminAction({
    ...auditActor(req),
    actionType: "calc.created",
    targetType: "calc_config",
    targetId: created.id,
    meta: {
      companyId: body.companyId,
      hubspotDealId: body.hubspotDealId ?? null,
      title: body.title ?? null
    }
  });
  res.status(201).json(created);
}

/**
 * PUT semantics: PARTIAL update (Sprint 6.6 bug fix). Fields absent
 * from the request body leave the matching column unchanged; only an
 * explicit `null` clears the field. See
 * calculator-configs.service.ts → updateCalculatorConfigById for the
 * undefined-vs-null resolver, and the schema docstring in
 * calculator-configs.schemas.ts for the contract.
 */
export async function updateController(req: Request, res: Response): Promise<void> {
  const id = parseUuidParam(req, "id");
  const body = updateCalculatorConfigSchema.parse(req.body);
  const updated = await updateCalculatorConfigById(id, body);
  // Sprint 9.X.B — audit log. Calc auto-saves on /calc/:id fire this
  // endpoint repeatedly while the operator edits, so the audit log
  // accumulates rows fast — that's intentional, the operator brief
  // calls for "зміни по документах" visibility. `meta.touchedKeys`
  // (list of fields the PUT body actually included) keeps each row
  // small but informative; the full payload isn't replicated here
  // (calculator_config_events already captures the snapshot).
  await recordAdminAction({
    ...auditActor(req),
    actionType: "calc.updated",
    targetType: "calc_config",
    targetId: id,
    meta: {
      companyId: updated.companyId,
      touchedKeys: Object.keys(body)
    }
  });
  res.status(200).json(updated);
}

export async function deleteController(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new TokenInvalidError();
  const id = parseUuidParam(req, "id");
  // Sprint 9.X.B — audit log. Fetch the calc BEFORE delete so we can
  // carry companyId + title into meta (the delete itself returns no
  // payload). If the calc is missing, `getCalculatorConfig` throws
  // 404 and we never reach the recordAdminAction call.
  const existing = await getCalculatorConfig(id);
  await deleteCalculatorConfigById(id);
  await recordAdminAction({
    ...auditActor(req),
    actionType: "calc.deleted",
    targetType: "calc_config",
    targetId: id,
    meta: {
      companyId: existing.companyId,
      title: existing.title
    }
  });
  res.status(204).end();
}

/**
 * Phase 9.I — POST /api/v1/calculator-configs/:id/sync.
 *
 * Manual HubSpot Note write-back for calc-configs. Mirrors the
 * documents sync endpoint: each call creates a FRESH Note in
 * HubSpot. The calc-config's hubspot_note_id is updated to the most
 * recent. Previous Notes stay in HubSpot (audit trail) — operator
 * can clean them up by hand if they don't want the clutter.
 *
 * Auto-saves on /calc/:id (PUT /calculator-configs/:id) deliberately
 * DO NOT touch HubSpot per operator brief.
 *
 * Auth: requireRole('admin') on the route — regular users can't
 * push to the customer's CRM timeline.
 */
export async function syncController(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new TokenInvalidError();
  const id = parseUuidParam(req, "id");
  // Phase 8 Stage 4 — pass req.user.id so the History panel attributes
  // the manual sync click to a real person. Auto-sync background path
  // (createCalculatorConfig setImmediate) calls the service with
  // `actorUserId=null` so it shows as "system".
  const updated = await syncCalculatorConfigToHubspot(id, req.user.id);
  // Sprint 9.X.B — audit log. Logged AFTER the sync resolves; a
  // HubSpot failure (502) re-throws above and we never get here, so
  // the audit row only exists when the Note was actually created /
  // updated. Auto-sync from the background setImmediate is NOT logged
  // (no req on that path; the system action shouldn't pollute the
  // operator's audit trail).
  await recordAdminAction({
    ...auditActor(req),
    actionType: "calc.synced",
    targetType: "calc_config",
    targetId: id,
    meta: {
      hubspotNoteId: updated.hubspotNoteId,
      companyId: updated.companyId
    }
  });
  res.status(200).json(updated);
}
