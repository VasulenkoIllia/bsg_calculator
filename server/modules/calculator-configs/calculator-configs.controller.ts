/**
 * HTTP controllers for the calculator-configs module.
 *
 * Thin Zod-validate + dispatch-to-service adapters. Auth is handled
 * by requireAuth middleware at the route level; the controller pulls
 * `req.user.id` for the audit column on POST.
 */

import type { Request, Response } from "express";
import { decodeCursor } from "../../shared/pagination";
import { parseUuidParam } from "../../shared/uuid-param";
import { TokenInvalidError } from "../../shared/errors";
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

export async function listController(req: Request, res: Response): Promise<void> {
  const query = listCalculatorConfigsQuerySchema.parse(req.query);
  const page = await listCalculatorConfigsPage({
    companyId: query.companyId,
    hubspotDealId: query.hubspotDealId,
    showAll: query.showAll,
    cursor: decodeCursor(query.cursor),
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
