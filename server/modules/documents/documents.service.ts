/**
 * Documents service.
 *
 * Owns:
 *   - Atomic create flow (numbering allocation + INSERT in one TX).
 *   - Cross-company-deal validation (same rule as calculator-configs).
 *   - `use-as-template` flow: clones doc → new calculator_config.
 *   - DTO projection.
 *
 * The PDF render endpoint lives in `pdf.service.ts` (Sprint 4.C) —
 * this file only deals with database state.
 */

import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { env } from "../../config/env";
import { logger } from "../../middleware/logger";
import { parseDtoOrInternalError } from "../../shared/dto-parse";
import { buildSortedPage, type PageResult } from "../../shared/sorted-pagination";
import {
  ConflictError,
  HubspotUnreachableError,
  NotFoundError,
  ValidationError
} from "../../shared/errors";
import { ensureDealBelongsToCompany } from "../../shared/deal-guard";
import { companies, type Document } from "../../db/schema";
import { insertDocumentEvent } from "../events/events.repository";
import { hubspot } from "../hubspot/hubspot.client";
import { insertCalculatorConfig } from "../calculator-configs/calculator-configs.repository";
import {
  cursorValueForRow,
  findByNumber,
  findCalculatorConfigById,
  insertDocumentWithNumber,
  listDocuments,
  restoreDocument as restoreDocumentRow,
  softDeleteDocument,
  updateDocumentHubspotSync,
  type DocumentWithCompanyName,
  type ListDocumentsArgs
} from "./documents.repository";
import {
  documentPublicSchema,
  type CreateDocumentRequest,
  type DocumentPublic
} from "./documents.schemas";
import { allocateNextNumber } from "./numbering.service";

/**
 * Sprint 6.8: dual signature like calculator-configs.toPublic. Plain
 * `Document` (single-fetch endpoints) omits companyName; the
 * `DocumentWithCompanyName` shape (list endpoint) surfaces it.
 */
function toPublic(row: Document | DocumentWithCompanyName): DocumentPublic {
  const companyName = "companyName" in row ? row.companyName : undefined;
  return parseDtoOrInternalError(
    documentPublicSchema,
    {
      id: row.id,
      number: row.number,
      companyId: row.companyId,
      ...(companyName !== undefined ? { companyName } : {}),
      hubspotDealId: row.hubspotDealId,
      calculatorConfigId: row.calculatorConfigId,
      scope: row.scope as DocumentPublic["scope"],
      payload: row.payload,
      addendum: row.addendum,
      hubspotSyncState: row.hubspotSyncState as DocumentPublic["hubspotSyncState"],
      hubspotNoteId: row.hubspotNoteId,
      createdByUserId: row.createdByUserId,
      // Phase 8 Stage 5 — surface soft-delete metadata on the public
      // DTO so the FE can render the "Deleted" badge + reason + note
      // on the row without a follow-up admin lookup.
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
      deletedByUserId: row.deletedByUserId,
      deletionReason: row.deletionReason as DocumentPublic["deletionReason"],
      deletionNote: row.deletionNote,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    },
    "documents.toPublic"
  );
}

export type DocumentListPage = PageResult<DocumentPublic>;

/**
 * Create a document. Wraps `allocateNextNumber` + `INSERT documents`
 * in a single transaction so a rollback returns the BSG-XXXXX number
 * to the pool (no gaps from failed FK checks etc.).
 *
 * If `calculatorConfigId` is provided (Flow A), the service verifies
 * it exists AND belongs to the same company before merging the calc
 * payload with any wizard meta the caller supplied in `body.payload`.
 * The merge is shallow: caller-supplied fields override calc-derived
 * fields. Wizard always provides the full payload today, so this is
 * a forward-compatibility hedge.
 */
export async function createDocument(
  body: CreateDocumentRequest,
  actorUserId: string
): Promise<DocumentPublic> {
  await ensureDealBelongsToCompany(body.hubspotDealId, body.companyId);

  // Sprint 9.L B2 — only the INSERT + numbering allocation happens
  // inside the TX. The auto-sync setImmediate schedule was previously
  // inside the TX callback, where a fast Node event-loop tick could
  // fire the sync BEFORE drizzle's COMMIT round-trip completed; the
  // sync's findByNumber then saw no row and persisted state='failed'
  // even though the document landed cleanly. Hoisting it AFTER the
  // db.transaction() promise resolves guarantees the row is visible.
  const inserted = await db.transaction(async tx => {
    // If a calc was provided, validate it belongs to the same company.
    // The calc itself is informational — we don't merge its payload
    // server-side; the frontend supplies the merged payload in body.
    // This check exists so a deleted/wrong-company calcId surfaces as
    // VALIDATION_FAILED rather than silently dropping the link.
    if (body.calculatorConfigId) {
      const calc = await findCalculatorConfigById(tx, body.calculatorConfigId);
      if (!calc) {
        throw new ValidationError(
          [{ path: ["calculatorConfigId"], message: "Calculator config not found" }],
          "Invalid calculatorConfigId"
        );
      }
      if (calc.companyId !== body.companyId) {
        throw new ValidationError(
          [
            {
              path: ["calculatorConfigId"],
              message: "Calculator config belongs to a different company"
            }
          ],
          "Cross-company calc reference"
        );
      }
    }

    // Look up the company's HubSpot id — required to build the
    // BSG-<seq>-<suffix> document number where suffix = last 6 chars
    // of hubspot_company_id. Inside the same TX so a non-existent
    // companyId fails the document INSERT FK too (defence in depth).
    const companyRow = await tx
      .select({ hubspotCompanyId: companies.hubspotCompanyId })
      .from(companies)
      .where(eq(companies.id, body.companyId))
      .limit(1);
    const hubspotCompanyId = companyRow[0]?.hubspotCompanyId;
    if (!hubspotCompanyId) {
      throw new ValidationError(
        [{ path: ["companyId"], message: "Company not found" }],
        "Unknown companyId"
      );
    }

    const number = await allocateNextNumber(tx, hubspotCompanyId);
    const row = await insertDocumentWithNumber(tx, {
      number,
      companyId: body.companyId,
      hubspotDealId: body.hubspotDealId ?? null,
      calculatorConfigId: body.calculatorConfigId ?? null,
      scope: body.scope,
      payload: body.payload,
      addendum: body.addendum ?? null,
      createdByUserId: actorUserId
    });

    // Phase 8 Stage 4 — write the 'created' event in the SAME TX so
    // we never have a documents row without its initial audit entry
    // (rollback wipes both together, commit publishes both together).
    await insertDocumentEvent(
      {
        documentId: row.id,
        eventType: "created",
        actorUserId,
        meta: { number: row.number, scope: row.scope }
      },
      tx
    );

    return row;
  });

  // Phase 9.G / Sprint 9.L B2 — auto-sync to HubSpot AFTER the TX
  // commits. We schedule the fire-and-forget sync via setImmediate so
  // it runs on a later event-loop tick (never blocking the response
  // — the operator gets 201 instantly, the badge flips from "Not
  // synced" → "Syncing…" → "Synced" via a follow-up GET on the
  // listings the FE invalidates).
  //
  // Failure path: syncDocumentToHubspot persists state='failed'
  // BEFORE re-throwing — operator clicks the manual Sync button
  // (kept for exactly this reason) for a Retry.
  if (env.AUTO_SYNC_TO_HUBSPOT) {
    const documentNumber = inserted.number;
    setImmediate(() => {
      // Lazy import to break the circular service ↔ sync dependency
      // and to keep the dev path (HUBSPOT_API_TOKEN absent) from
      // pulling in the sync module on the hot save path.
      void import("./sync.service").then(async ({ syncDocumentToHubspot }) => {
        try {
          await syncDocumentToHubspot(documentNumber);
        } catch (err) {
          // syncDocumentToHubspot already persisted state='failed'
          // and logged the upstream error in detail. We add one
          // INFO line here so a routine `docker compose logs` trace
          // shows the auto-sync touch-point. Don't re-throw — the
          // request has long since returned 201 to the operator and
          // an unhandled rejection would crash the worker.
          logger.info(
            {
              documentNumber,
              err: (err as Error).message
            },
            "[documents:auto-sync] background sync failed (already logged in sync.service); document marked 'failed' — operator can Retry from the UI"
          );
        }
      });
    });
  }

  return toPublic(inserted);
}

export async function getDocumentByNumber(number: string): Promise<DocumentPublic> {
  const row = await findByNumber(number);
  if (!row) throw new NotFoundError("Document");
  return toPublic(row);
}

/** Internal helper — same as getByNumber but returns the raw row for the PDF service. */
export async function getRawDocumentByNumber(number: string): Promise<Document> {
  const row = await findByNumber(number);
  if (!row) throw new NotFoundError("Document");
  return row;
}

export async function listDocumentsPage(
  args: ListDocumentsArgs
): Promise<DocumentListPage> {
  const rows = await listDocuments({ ...args, limit: args.limit + 1 });
  return buildSortedPage(rows, args.limit, args.sort, toPublic, row => ({
    value: cursorValueForRow(row, args.sort.field),
    id: row.id
  }));
}

/**
 * Flow B: "Use as template" — given an existing document, clone its
 * calc-slice payload into a NEW calculator_configs row. Returns the
 * new config id so the frontend can navigate to /calc/:configId.
 *
 * The doc's company + deal are inherited. The title is auto-prefixed
 * with "Template of <BSG-XXXXX>" so the operator can find it later.
 *
 * NOT wrapped in a transaction because there's nothing to roll back:
 * a failed config insert returns an error to the client without
 * touching the source doc.
 */
export async function useDocumentAsTemplate(
  number: string,
  actorUserId: string
): Promise<{ configId: string; redirectUrl: string }> {
  const doc = await findByNumber(number);
  if (!doc) throw new NotFoundError("Document");
  // Phase 8 Stage 5 — refuse to template from a soft-deleted doc.
  // The payload may still be conceptually valid, but operators
  // shouldn't accidentally bootstrap new work from a retracted
  // artefact. super_admin can restore first if they really want this.
  if (doc.deletedAt) {
    throw new NotFoundError("Document");
  }

  // The document's payload contains both calc snapshot fields AND
  // wizard meta (header / parties / signatures). We forward the
  // ENTIRE payload — the frontend's calculator hydration will pick
  // up only the calc fields it knows about; wizard meta is
  // effectively ignored at the calc layer.
  const newConfig = await insertCalculatorConfig({
    companyId: doc.companyId,
    hubspotDealId: doc.hubspotDealId,
    title: `Template of ${doc.number}`,
    payload: doc.payload,
    createdByUserId: actorUserId
  });
  return {
    configId: newConfig.id,
    redirectUrl: `/calc/${newConfig.id}`
  };
}

/**
 * Phase 8 Stage 5 — soft-delete a document with HubSpot Note
 * tear-down.
 *
 * Flow (per docs/phase_8_security_admin_audit.md §4):
 *   1. Load the document. 404 if missing OR already soft-deleted.
 *   2. If the document has a HubSpot Note (hubspotNoteId != null
 *      AND state is 'synced' OR 'delete_failed'):
 *        a. Mark state='delete_pending' (so a concurrent read
 *           sees the in-flight delete).
 *        b. DELETE the Note via HubSpot API.
 *        c. On success → soft-delete locally (clears noteId,
 *           state back to 'not_synced', sets deleted_at + actor
 *           + reason + note).
 *        d. On failure → mark state='delete_failed', leave row
 *           ALIVE so the operator can retry. Record 'sync_failed'
 *           event with stage='delete'.
 *   3. If no HubSpot Note: just soft-delete locally + emit event.
 *
 * Returns the updated DocumentPublic so the controller can echo
 * back the new state for the FE to invalidate its cache. The FE
 * route handler navigates back to /documents on success.
 */
export const DELETION_REASONS = [
  "client_request",
  "created_in_error",
  "replaced_by_new_version",
  "duplicate",
  "other"
] as const;
export type DeletionReason = (typeof DELETION_REASONS)[number];

export async function deleteDocument(
  number: string,
  actorUserId: string,
  reason: DeletionReason,
  note: string | null
): Promise<DocumentPublic> {
  const doc = await findByNumber(number);
  if (!doc) throw new NotFoundError("Document");
  if (doc.deletedAt) {
    // Already soft-deleted. Idempotency would be nice but the
    // operator's UI flow should never re-issue DELETE on a row
    // they can already see crossed out — surface as 409 so a
    // genuine double-click is detected rather than silently
    // re-attempting a HubSpot delete that already happened.
    throw new ConflictError(
      "DOCUMENT_ALREADY_DELETED",
      "This document is already soft-deleted."
    );
  }

  // Decide whether HubSpot tear-down is needed. We hit HubSpot when:
  //   - the row has a noteId AND
  //   - last sync state was 'synced' OR 'delete_failed' (retry).
  // Other states ('not_synced', 'failed', 'delete_pending')
  // shouldn't have a live HubSpot Note to clean up.
  const needsHubspot =
    doc.hubspotNoteId !== null &&
    (doc.hubspotSyncState === "synced" || doc.hubspotSyncState === "delete_failed");

  if (needsHubspot && doc.hubspotNoteId) {
    if (!hubspot.isConfigured()) {
      // HubSpot intentionally not wired in this env — proceeding
      // would leave the upstream Note orphaned. Refuse the delete
      // and surface a clear error so the operator can ask ops.
      throw new ValidationError(
        [{ path: ["hubspot"], message: "HubSpot integration is not configured." }],
        "HubSpot not configured — cannot tear down upstream Note"
      );
    }

    // Mark the in-flight state so a parallel reader sees something
    // sensible (not just stale 'synced' while the API call runs).
    await updateDocumentHubspotSync(doc.id, {
      hubspotSyncState: "delete_pending",
      hubspotNoteId: doc.hubspotNoteId
    });

    try {
      await hubspot.deleteNote(doc.hubspotNoteId);
    } catch (err) {
      // Roll the state forward to 'delete_failed' and emit an event
      // so the History panel shows what happened. The row stays
      // ALIVE — operator clicks the retry CTA which re-runs this
      // path.
      await updateDocumentHubspotSync(doc.id, {
        hubspotSyncState: "delete_failed",
        hubspotNoteId: doc.hubspotNoteId
      });
      try {
        await insertDocumentEvent({
          documentId: doc.id,
          eventType: "sync_failed",
          actorUserId,
          meta: {
            stage: "delete",
            noteId: doc.hubspotNoteId,
            error: (err as Error).message
          }
        });
      } catch (eventErr) {
        logger.warn(
          { documentId: doc.id, err: (eventErr as Error).message },
          "[documents:delete] failed to record sync_failed event"
        );
      }
      logger.error(
        {
          documentId: doc.id,
          documentNumber: doc.number,
          noteId: doc.hubspotNoteId,
          err: (err as Error).message
        },
        "[documents:delete] HubSpot deleteNote failed — document still alive, operator can Retry"
      );
      throw err instanceof HubspotUnreachableError
        ? err
        : new HubspotUnreachableError(
            `Failed to delete HubSpot Note (${doc.hubspotNoteId}): ${(err as Error).message}`,
            { noteId: doc.hubspotNoteId }
          );
    }
  }

  // HubSpot side either wasn't needed or just succeeded. Soft-delete
  // locally. The repo helper sets deleted_at + actor + reason + note,
  // clears the noteId pointer (we just tore down the upstream Note),
  // and resets state to 'not_synced'.
  const updated = await softDeleteDocument(doc.id, actorUserId, reason, note);
  if (!updated) {
    throw new Error(`[documents:delete] document ${doc.number} disappeared mid-delete`);
  }

  // Record the deletion in the history timeline. Best-effort —
  // a failure here shouldn't roll back the local soft-delete (the
  // row is already updated; we just lose one audit entry).
  try {
    await insertDocumentEvent({
      documentId: updated.id,
      eventType: "deleted",
      actorUserId,
      meta: { reason, note, hubspotNoteIdRemoved: doc.hubspotNoteId }
    });
  } catch (eventErr) {
    logger.warn(
      { documentId: updated.id, err: (eventErr as Error).message },
      "[documents:delete] failed to record 'deleted' event"
    );
  }

  logger.info(
    {
      documentId: updated.id,
      documentNumber: updated.number,
      actorUserId,
      reason,
      hadHubspotNote: doc.hubspotNoteId !== null
    },
    "[documents:delete] document soft-deleted"
  );

  return toPublic(updated);
}

/**
 * Phase 8 Stage 5 — super_admin-only restore. Clears the
 * soft-delete fields. Does NOT re-create the HubSpot Note —
 * operator clicks the existing Sync button if they want the
 * document back on the customer timeline.
 *
 * Throws NotFoundError when the document doesn't exist OR isn't
 * currently soft-deleted (restore-on-alive is a no-op; we surface
 * it as 404 so the UI's restore button which is only shown on
 * deleted rows doesn't silently do nothing on a stale list).
 */
export async function restoreDocument(
  number: string,
  actorUserId: string
): Promise<DocumentPublic> {
  const doc = await findByNumber(number);
  if (!doc) throw new NotFoundError("Document");
  if (!doc.deletedAt) {
    throw new NotFoundError("Document");
  }

  const updated = await restoreDocumentRow(doc.id);
  if (!updated) {
    throw new Error(`[documents:restore] document ${doc.number} disappeared mid-restore`);
  }

  try {
    await insertDocumentEvent({
      documentId: updated.id,
      eventType: "restored",
      actorUserId,
      meta: {}
    });
  } catch (eventErr) {
    logger.warn(
      { documentId: updated.id, err: (eventErr as Error).message },
      "[documents:restore] failed to record 'restored' event"
    );
  }

  logger.info(
    {
      documentId: updated.id,
      documentNumber: updated.number,
      actorUserId
    },
    "[documents:restore] document restored"
  );

  return toPublic(updated);
}
