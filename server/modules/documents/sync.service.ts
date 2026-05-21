/**
 * Phase 9 — HubSpot Note write-back service.
 *
 * Triggered by `POST /api/v1/documents/:number/sync`. Steps:
 *   1. Load the document row by BSG number.
 *   2. Resolve the parent company name (for the Note header).
 *   3. Build a plain-text Note body (`note-builder.ts`).
 *   4. Find the HubSpot association target:
 *        - if document has `hubspotDealId` → associate with that deal
 *        - else → associate with the parent company's HubSpot id
 *   5. POST to HubSpot `createNote` → get noteId.
 *   6. PUT the association (Note → Deal or Company).
 *   7. UPDATE `documents.hubspot_note_id` + `hubspot_sync_state='synced'`.
 *   8. On any HubSpot failure → state='failed' + null noteId; the
 *      controller surfaces the error to the operator UI, which shows
 *      a Retry button.
 *
 * The Note is ALWAYS created fresh on each sync (operator brief —
 * "Створювати нову Note кожен раз"). Previous Notes stay in HubSpot
 * as an audit trail; `documents.hubspot_note_id` points to the most
 * recent one. If the operator wants a single Note per doc, they
 * delete the older ones manually in HubSpot.
 */

import { findCompanyById } from "../companies/companies.repository";
import {
  HubspotUnreachableError,
  NotFoundError,
  ValidationError
} from "../../shared/errors";
import { logger } from "../../middleware/logger";
import { hubspot } from "../hubspot/hubspot.client";
import {
  buildHubspotNoteBody,
  noteKindFromDocumentScope
} from "./note-builder";
import {
  findByNumber,
  updateDocumentHubspotSync
} from "./documents.repository";
import { getDocumentByNumber } from "./documents.service";
import { findUserById } from "../users/users.repository";
import type { DocumentPublic } from "./documents.schemas";

/**
 * Public sync entrypoint. Returns the updated document DTO so the
 * controller can echo the new state to the client (which then
 * invalidates the documents listing query).
 *
 * Throws:
 *   - `NotFoundError` if the document doesn't exist
 *   - `ValidationError` if HubSpot is not configured (missing
 *     access token at boot — caught at startup, but defensively
 *     re-checked here for clarity)
 *   - `HubspotUnreachableError` (502) for any upstream HubSpot
 *     failure; the document row IS persisted with
 *     `hubspot_sync_state='failed'` BEFORE the error re-throws so
 *     the operator UI can show the failed badge + Retry button.
 */
export async function syncDocumentToHubspot(
  number: string
): Promise<DocumentPublic> {
  const document = await findByNumber(number);
  if (!document) {
    throw new NotFoundError("Document");
  }

  if (!hubspot.isConfigured()) {
    throw new ValidationError(
      [{ path: ["hubspot"], message: "HubSpot integration is not configured." }],
      "HubSpot not configured"
    );
  }

  // Parent company lookup is mandatory — every document has a
  // non-null companyId FK. We need the name for the Note body and
  // the HubSpot company id for the association fallback.
  const company = await findCompanyById(document.companyId);
  if (!company) {
    // This is a DB-level inconsistency (FK should prevent it) but
    // we surface it as a clean 404 rather than crashing.
    throw new NotFoundError("Parent company");
  }

  // Phase 9.H — Note body now carries `Created … by <displayName>
  // (<email>)`. Look up the operator who created the document.
  const actor = await findUserById(document.createdByUserId);
  if (!actor) {
    // Same defensive 404 — created_by_user_id is a non-null FK so
    // this only fires if a row was hand-deleted out of band.
    throw new NotFoundError("Document author");
  }

  const body = buildHubspotNoteBody({
    kind: noteKindFromDocumentScope(document.scope as "offer" | "agreement" | "offer_and_agreement"),
    identifier: document.number,
    companyName: company.name,
    createdAt: document.createdAt,
    actor: { displayName: actor.displayName, email: actor.email },
    detailPath: `/documents/${encodeURIComponent(document.number)}`
  });

  // Step 1: create the Note (no association yet).
  let noteId: string;
  try {
    const note = await hubspot.createNote({ body });
    noteId = note.id;
  } catch (err) {
    // Mark the document failed BEFORE re-throwing so the next GET
    // shows the failed badge. Don't carry forward an old noteId —
    // that would be misleading (the new Note never landed).
    await updateDocumentHubspotSync(document.id, {
      hubspotSyncState: "failed",
      hubspotNoteId: null
    });
    logger.error(
      {
        documentId: document.id,
        documentNumber: document.number,
        err: (err as Error).message
      },
      "[documents:sync] createNote failed — document marked failed"
    );
    throw err;
  }

  // Step 2: associate the Note. Prefer Deal if the document is
  // pinned to one (the operator confirmed this preference: "Тільки
  // Deal якщо є, інакше Company").
  const target =
    document.hubspotDealId !== null
      ? { type: "deal" as const, id: document.hubspotDealId }
      : { type: "company" as const, id: company.hubspotCompanyId };

  try {
    await hubspot.associateNoteWith({
      noteId,
      toObjectType: target.type,
      toObjectId: target.id
    });
  } catch (err) {
    // The Note exists in HubSpot but has no associations — it'll
    // show up as a stand-alone activity in the operator's HubSpot
    // home feed. Not ideal, but not catastrophic. We still persist
    // the noteId + state=failed so the operator can manually
    // associate it (or click Retry, which creates a NEW Note +
    // association — the orphan Note can be deleted later).
    await updateDocumentHubspotSync(document.id, {
      hubspotSyncState: "failed",
      hubspotNoteId: noteId
    });
    logger.error(
      {
        documentId: document.id,
        documentNumber: document.number,
        noteId,
        associationTarget: target,
        err: (err as Error).message
      },
      "[documents:sync] note created but association failed"
    );
    // Re-throw a HubspotUnreachableError so the controller's error
    // handler maps it to 502. Original error (could be a plain
    // Error from the .put helper) is wrapped for consistency.
    throw err instanceof HubspotUnreachableError
      ? err
      : new HubspotUnreachableError(
          `Note created (${noteId}) but association failed: ${(err as Error).message}`,
          { noteId, target }
        );
  }

  // Step 3: persist the new state. Single UPDATE — no TX needed
  // because the only relational invariant here is "noteId points to
  // a real HubSpot note", and HubSpot already confirmed that.
  const updated = await updateDocumentHubspotSync(document.id, {
    hubspotSyncState: "synced",
    hubspotNoteId: noteId
  });
  if (!updated) {
    // Pathological: the document row vanished between the find and
    // the update. Surface as a 500 (would only happen during a
    // concurrent delete in Stage 5).
    throw new Error(
      `[documents:sync] document ${document.number} disappeared mid-sync`
    );
  }

  logger.info(
    {
      documentId: updated.id,
      documentNumber: updated.number,
      noteId,
      associationTarget: target
    },
    "[documents:sync] document synced to HubSpot"
  );

  // Re-fetch through the standard service so the public DTO carries
  // the same companyName-JOIN shape (Sprint 7.x) consumers expect.
  return getDocumentByNumber(updated.number);
}
