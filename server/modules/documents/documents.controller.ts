/**
 * HTTP controllers for the documents module.
 *
 * The PDF download endpoint lives in `pdf.controller.ts` (Sprint 4.C).
 */

import type { Request, Response } from "express";
import { db } from "../../db/client";
import {
  decodeSortedCursor,
  encodeSortKey,
  parseSortQuery
} from "../../shared/sorted-pagination";
import { TokenInvalidError } from "../../shared/errors";
import { documentSortFields } from "./documents.repository";
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
import { syncDocumentToHubspot } from "./sync.service";
import { peekNextNumber } from "./numbering.service";

export async function listController(req: Request, res: Response): Promise<void> {
  const query = listDocumentsQuerySchema.parse(req.query);
  // Sprint 6.8: per-column sort. The cursor encodes the sort spec it
  // was minted under, so a mismatch between `?sort=` and the cursor's
  // own sort surfaces as a 400 inside `decodeSortedCursor` rather
  // than returning weirdly-ordered rows.
  const sort = parseSortQuery(query.sort, documentSortFields, {
    field: "createdAt",
    dir: "desc"
  });
  const cursor = decodeSortedCursor(query.cursor, encodeSortKey(sort));
  const page = await listDocumentsPage({
    companyId: query.companyId,
    hubspotDealId: query.hubspotDealId,
    calculatorConfigId: query.calculatorConfigId,
    scope: query.scope,
    q: query.q,
    sort,
    cursor,
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
 * Phase 9 — POST /api/v1/documents/:number/sync.
 *
 * Writes a HubSpot Note (text + link to our SPA) for this document
 * and associates it with the document's HubSpot deal (if pinned) or
 * its parent company (fallback). See `sync.service.ts` for the
 * step-by-step flow.
 *
 * Response: `200 OK` + updated document DTO (carries the new
 * `hubspotSyncState` + `hubspotNoteId`). The frontend uses these
 * to flip the status badge from "Not synced" → "Synced".
 *
 * Errors:
 *   - 404 if document or parent company missing
 *   - 502 HubspotUnreachableError on any HubSpot API failure (the
 *     document row is updated to `hubspot_sync_state='failed'`
 *     BEFORE the error re-throws, so a subsequent GET shows the
 *     failed badge + Retry CTA).
 */
export async function syncController(
  req: Request,
  res: Response
): Promise<void> {
  if (!req.user) {
    throw new TokenInvalidError("Token references a deleted user.");
  }
  const number = req.params.number;
  // Phase 8 Stage 4 — pass the clicker's id so the recorded sync
  // event in the History panel reads as "<displayName> synced
  // BSG-XXX". Auto-sync from createDocument's setImmediate passes
  // null (no req.user there) and the event reads as "system".
  const updated = await syncDocumentToHubspot(number, req.user.id);
  res.status(200).json(updated);
}
