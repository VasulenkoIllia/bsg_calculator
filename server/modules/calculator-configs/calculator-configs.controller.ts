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
  res.status(200).json(updated);
}

export async function deleteController(req: Request, res: Response): Promise<void> {
  const id = parseUuidParam(req, "id");
  await deleteCalculatorConfigById(id);
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
  const id = parseUuidParam(req, "id");
  // Phase 8 Stage 4 — pass req.user.id so the History panel attributes
  // the manual sync click to a real person. Auto-sync background path
  // (createCalculatorConfig setImmediate) calls the service with
  // `actorUserId=null` so it shows as "system".
  const updated = await syncCalculatorConfigToHubspot(id, req.user?.id ?? null);
  res.status(200).json(updated);
}
