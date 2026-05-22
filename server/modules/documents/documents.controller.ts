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
import { recordAdminAction } from "../admin-actions/admin-actions.service";
import { documentSortFields } from "./documents.repository";
import {
  createDocumentSchema,
  deleteDocumentSchema,
  listDocumentsQuerySchema
} from "./documents.schemas";
import {
  createDocument,
  deleteDocument,
  getDocumentByNumber,
  listDocumentsPage,
  restoreDocument,
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

  // Sprint 9.N — `includeDeleted` is now a regular product filter,
  // not a permission scope. The Status dropdown on the FE listing
  // sends one of: undefined (= all rows), "false" (= alive only),
  // "true" (= alive + deleted, same as undefined), "only" (=
  // deleted only). Any authenticated user can pass any value.
  //
  // Reasoning: Sprint 9.M's super_admin gate was an over-correction;
  // the operator brief calls for "video всі документи з відміткою",
  // and `deletionNote` (the sensitive bit) is still narrowed at the
  // single-doc fetch level via `toPublic`'s canSeeDeletionNote flag.
  const wantsDeleted = query.includeDeleted ?? "true";
  const deletedScope =
    wantsDeleted === "false"
      ? ("alive" as const)
      : wantsDeleted === "only"
        ? ("deleted_only" as const)
        : ("include_deleted" as const);

  const page = await listDocumentsPage({
    companyId: query.companyId,
    hubspotDealId: query.hubspotDealId,
    calculatorConfigId: query.calculatorConfigId,
    scope: query.scope,
    q: query.q,
    sort,
    cursor,
    limit: query.limit,
    deletedScope
  });
  res.status(200).json(page);
}

export async function getByNumberController(
  req: Request,
  res: Response
): Promise<void> {
  const number = req.params.number;
  // Sprint 9.N — soft-deleted documents are visible to all authenticated
  // users (revert of Sprint 9.M B5). The `actorRole` arg now only
  // narrows `deletionNote` visibility inside `toPublic` — regular
  // users see the reason but not the free-text note content.
  const doc = await getDocumentByNumber(number, req.user?.role ?? "user");
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

/**
 * Phase 8 Stage 5 — DELETE /api/v1/documents/:number.
 *
 * Soft-deletes the document locally + hard-deletes the linked
 * HubSpot Note (if one exists). Admin role required (regular
 * users can't retract documents).
 *
 * Body: { reason, note? } — `note` REQUIRED when reason='other'
 * (enforced by the Zod refine).
 *
 * Errors:
 *   - 404 if the document doesn't exist
 *   - 409 DOCUMENT_ALREADY_DELETED if it's already soft-deleted
 *   - 502 HUBSPOT_UNREACHABLE on HubSpot DELETE failure — local
 *     row stays alive with state='delete_failed' so operator
 *     can Retry.
 */
export async function deleteController(
  req: Request,
  res: Response
): Promise<void> {
  if (!req.user) {
    throw new TokenInvalidError("Token references a deleted user.");
  }
  const number = req.params.number;
  const body = deleteDocumentSchema.parse(req.body);
  const updated = await deleteDocument(
    number,
    req.user.id,
    body.reason,
    body.note ?? null
  );
  await recordAdminAction({
    actorUserId: req.user.id,
    actionType: "document.deleted",
    targetType: "document",
    targetId: number,
    // hasNote breadcrumb only — keep the operator's free-text note
    // OUT of the audit listing (it can be sensitive).
    meta: { reason: body.reason, hasNote: Boolean(body.note) }
  });
  res.status(200).json(updated);
}

/**
 * Phase 8 Stage 5 — POST /api/v1/documents/:number/restore.
 *
 * Clears the soft-delete fields on a previously-deleted document.
 * super_admin role required (audit-trail integrity — restore
 * decisions are a single chokepoint).
 *
 * Does NOT re-create the HubSpot Note. Operator manually re-syncs
 * via the existing Sync button if they want the document back on
 * the customer timeline.
 *
 * Errors:
 *   - 404 if the document doesn't exist OR isn't currently deleted
 */
export async function restoreController(
  req: Request,
  res: Response
): Promise<void> {
  if (!req.user) {
    throw new TokenInvalidError("Token references a deleted user.");
  }
  const number = req.params.number;
  const updated = await restoreDocument(number, req.user.id);
  await recordAdminAction({
    actorUserId: req.user.id,
    actionType: "document.restored",
    targetType: "document",
    targetId: number
  });
  res.status(200).json(updated);
}
