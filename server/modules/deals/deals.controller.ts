/**
 * HTTP controllers for the deals module.
 */

import type { Request, Response } from "express";
import { decodeCursor } from "../../shared/pagination";
import { parseUuidParam } from "../../shared/uuid-param";
import { listDealsQuerySchema } from "./deals.schemas";
import { getDeal, searchDeals } from "./deals.service";
import { findCompanyByHubspotId } from "../companies/companies.repository";
import { NotFoundError } from "../../shared/errors";

export async function listController(req: Request, res: Response): Promise<void> {
  const query = listDealsQuerySchema.parse(req.query);
  const page = await searchDeals({
    stage: query.stage,
    hubspotCompanyId: query.hubspotCompanyId,
    businessVertical: query.businessVertical,
    cursor: decodeCursor(query.cursor),
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
 * URL `:id` is the company's INTERNAL uuid. We resolve it to the
 * natural key (`hubspot_company_id`) and reuse the searchDeals
 * filter.
 */
export async function dealsByCompanyController(
  req: Request,
  res: Response
): Promise<void> {
  const id = parseUuidParam(req, "id");
  // Fetch the company first (via the companies repository to avoid
  // a duplicate service helper). Throw 404 if the operator hit a
  // non-existent uuid.
  const { findCompanyById } = await import("../companies/companies.repository");
  const company = await findCompanyById(id);
  if (!company) throw new NotFoundError("Company");

  const query = listDealsQuerySchema.parse(req.query);
  const page = await searchDeals({
    stage: query.stage,
    hubspotCompanyId: company.hubspotCompanyId,
    businessVertical: query.businessVertical,
    cursor: decodeCursor(query.cursor),
    limit: query.limit
  });
  res.status(200).json(page);
  void findCompanyByHubspotId; // imported for explicit consumer reference
}
