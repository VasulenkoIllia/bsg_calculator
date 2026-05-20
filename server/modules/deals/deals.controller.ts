/**
 * HTTP controllers for the deals module — thin Zod-validate +
 * dispatch-to-service adapters.
 */

import type { Request, Response } from "express";
import {
  decodeSortedCursor,
  encodeSortKey,
  parseSortQuery
} from "../../shared/sorted-pagination";
import { parseUuidParam } from "../../shared/uuid-param";
import { dealSortFields } from "./deals.repository";
import { listDealsQuerySchema } from "./deals.schemas";
import { getDeal, searchDeals, searchDealsByCompanyUuid } from "./deals.service";

export async function listController(req: Request, res: Response): Promise<void> {
  const query = listDealsQuerySchema.parse(req.query);
  // Sprint 7.2: per-column sort. Default createdAt:desc.
  const sort = parseSortQuery(query.sort, dealSortFields, {
    field: "createdAt",
    dir: "desc"
  });
  const cursor = decodeSortedCursor(query.cursor, encodeSortKey(sort));
  const page = await searchDeals({
    stage: query.stage,
    hubspotCompanyId: query.hubspotCompanyId,
    businessVertical: query.businessVertical,
    sort,
    cursor,
    limit: query.limit
  });
  res.status(200).json(page);
}

export async function getController(req: Request, res: Response): Promise<void> {
  const id = parseUuidParam(req, "id");
  const deal = await getDeal(id);
  res.status(200).json(deal);
}

/**
 * Mounted on the companies router at /api/v1/companies/:id/deals.
 *
 * URL `:id` is the company's INTERNAL uuid. We delegate the uuid →
 * hubspot_company_id resolution + 404 handling to
 * `deals.service.searchDealsByCompanyUuid`, keeping the controller
 * thin per backend_conventions.md §1.
 */
export async function dealsByCompanyController(
  req: Request,
  res: Response
): Promise<void> {
  const companyUuid = parseUuidParam(req, "id");
  const query = listDealsQuerySchema.parse(req.query);
  const sort = parseSortQuery(query.sort, dealSortFields, {
    field: "createdAt",
    dir: "desc"
  });
  const cursor = decodeSortedCursor(query.cursor, encodeSortKey(sort));
  const page = await searchDealsByCompanyUuid(companyUuid, {
    stage: query.stage,
    businessVertical: query.businessVertical,
    sort,
    cursor,
    limit: query.limit
  });
  res.status(200).json(page);
}
