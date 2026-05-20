/**
 * HTTP controllers for the companies module — thin Zod-validate +
 * dispatch-to-service adapters.
 */

import type { Request, Response } from "express";
import {
  decodeSortedCursor,
  encodeSortKey,
  parseSortQuery
} from "../../shared/sorted-pagination";
import { parseUuidParam } from "../../shared/uuid-param";
import { companySortFields } from "./companies.repository";
import { listCompaniesQuerySchema } from "./companies.schemas";
import { getCompany, searchCompanies } from "./companies.service";

export async function listController(req: Request, res: Response): Promise<void> {
  const query = listCompaniesQuerySchema.parse(req.query);
  // Sprint 7.2: per-column sort. Default createdAt:desc preserves
  // pre-7.2 behaviour for clients that don't pass `sort`.
  const sort = parseSortQuery(query.sort, companySortFields, {
    field: "createdAt",
    dir: "desc"
  });
  const cursor = decodeSortedCursor(query.cursor, encodeSortKey(sort));
  const page = await searchCompanies({
    q: query.q,
    sort,
    cursor,
    limit: query.limit
  });
  res.status(200).json(page);
}

export async function getController(req: Request, res: Response): Promise<void> {
  const id = parseUuidParam(req, "id");
  const company = await getCompany(id);
  res.status(200).json(company);
}
