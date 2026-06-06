/**
 * HTTP controllers for the companies module — thin Zod-validate +
 * dispatch-to-service adapters.
 */

import type { Request, Response } from "express";
import { TokenInvalidError } from "../../shared/errors";
import { auditActor } from "../../shared/audit-actor";
import {
  decodeSortedCursor,
  encodeSortKey,
  parseSortQuery
} from "../../shared/sorted-pagination";
import { parseUuidParam } from "../../shared/uuid-param";
import { recordAdminAction } from "../admin-actions/admin-actions.service";
import { companySortFields } from "./companies.repository";
import { listCompaniesQuerySchema } from "./companies.schemas";
import { getCompany, purgeDeletedCompany, searchCompanies } from "./companies.service";

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

/**
 * ADMIN — fully delete a HubSpot-deleted company + ALL its documents from
 * OUR system (route-gated to admin/super_admin). The service refuses
 * unless `hubspot_deleted_at` is set; the action is audited. Irreversible.
 */
export async function purgeController(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new TokenInvalidError("Token references a deleted user.");
  }
  const id = parseUuidParam(req, "id");
  const summary = await purgeDeletedCompany(id);
  await recordAdminAction({
    ...auditActor(req),
    actionType: "company.purged",
    targetType: "company",
    targetId: id,
    meta: {
      hubspotCompanyId: summary.hubspotCompanyId,
      name: summary.name,
      documentsDeleted: summary.documents,
      dealsDeleted: summary.deals
    }
  });
  res.status(200).json(summary);
}
