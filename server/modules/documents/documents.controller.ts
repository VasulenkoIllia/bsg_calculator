/**
 * HTTP controllers for the documents module.
 *
 * The PDF download endpoint lives in `pdf.controller.ts` (Sprint 4.C).
 */

import type { Request, Response } from "express";
import { db } from "../../db/client";
import { decodeCursor } from "../../shared/pagination";
import { NotImplementedError, TokenInvalidError } from "../../shared/errors";
import {
  createDocumentSchema,
  listDocumentsQuerySchema
} from "./documents.schemas";
import {
  createDocument,
  getDocumentByNumber,
  listDocumentsPage,
  useDocumentAsTemplate
} from "./documents.service";
import { peekNextNumber } from "./numbering.service";

export async function listController(req: Request, res: Response): Promise<void> {
  const query = listDocumentsQuerySchema.parse(req.query);
  const page = await listDocumentsPage({
    companyId: query.companyId,
    hubspotDealId: query.hubspotDealId,
    calculatorConfigId: query.calculatorConfigId,
    scope: query.scope,
    q: query.q,
    cursor: decodeCursor(query.cursor),
    limit: query.limit
  });
  res.status(200).json(page);
}

export async function getByNumberController(
  req: Request,
  res: Response
): Promise<void> {
  const number = req.params.number;
  const doc = await getDocumentByNumber(number);
  res.status(200).json(doc);
}

export async function createController(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new TokenInvalidError();
  const body = createDocumentSchema.parse(req.body);
  const created = await createDocument(body, req.user.id);
  res.status(201).json(created);
}

export async function useAsTemplateController(
  req: Request,
  res: Response
): Promise<void> {
  if (!req.user) throw new TokenInvalidError();
  const number = req.params.number;
  const result = await useDocumentAsTemplate(number, req.user.id);
  res.status(201).json(result);
}

/**
 * GET /api/v1/numbering/peek[?hubspotCompanyId=…] — preview the next
 * BSG-<seq>-<suffix> without advancing the sequence. Wizard uses this
 * to show "Document Number: BSG-7100024-874808" on Step 1 (Header).
 *
 * When `hubspotCompanyId` is omitted, the suffix is rendered as
 * `XXXXXX` so the wizard can show a partial preview before the
 * operator picks a company.
 *
 * Note: two near-simultaneous peeks return the SAME seq; the real
 * allocation happens inside POST /documents and may be different
 * if another save lands in between.
 */
export async function peekNumberController(
  req: Request,
  res: Response
): Promise<void> {
  const raw = req.query.hubspotCompanyId;
  const hubspotCompanyId =
    typeof raw === "string" && raw.length > 0 && raw.length <= 64 ? raw : undefined;
  const next = await peekNextNumber(db, hubspotCompanyId);
  res.status(200).json({ next });
}

/**
 * Sprint 4 stub for the Phase 9 HubSpot Note write-back. Returns 501
 * so the frontend can ship the sync-trigger UI without crashing —
 * Phase 9 swaps in the real implementation. `_req` / `_res` naming
 * acknowledges the unused parameters without the awkward `void`
 * suppression idiom.
 */
export async function syncController(
  _req: Request,
  _res: Response
): Promise<void> {
  throw new NotImplementedError(
    "HubSpot sync is not yet enabled. Will ship in Phase 9."
  );
}
