/**
 * HTTP controllers for the companies module — thin Zod-validate +
 * dispatch-to-service adapters.
 */

import type { Request, Response } from "express";
import { decodeCursor } from "../../shared/pagination";
import { parseUuidParam } from "../../shared/uuid-param";
import { listCompaniesQuerySchema } from "./companies.schemas";
import { getCompany, searchCompanies } from "./companies.service";

export async function listController(req: Request, res: Response): Promise<void> {
  const query = listCompaniesQuerySchema.parse(req.query);
  const page = await searchCompanies({
    q: query.q,
    companyType: query.companyType,
    cursor: decodeCursor(query.cursor),
    limit: query.limit
  });
  res.status(200).json(page);
}

export async function getController(req: Request, res: Response): Promise<void> {
  const id = parseUuidParam(req, "id");
  const company = await getCompany(id);
  res.status(200).json(company);
}
