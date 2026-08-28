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

import { sql } from "drizzle-orm";
import { db } from "../../db/client";
import { findCompanyById } from "../companies/companies.repository";
import { findDealByHubspotId } from "../deals/deals.repository";
import {
  ConflictError,
  NotFoundError,
  ValidationError
} from "../../shared/errors";
import { logger } from "../../middleware/logger";
import {
  buildHubspotNoteBody,
  noteKindFromDocumentScope
} from "../../shared/hubspot/note-builder";
import { insertCrmNote } from "../crm-notes/crm-notes.repository";
import { activeCrmName, crmIsConfigured, publishCrmNote } from "../crm-notes/crm-notes.service";
import { insertDocumentEvent } from "../events/events.repository";
import { tryRecordEvent } from "../events/events.helpers";
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
  number: string,
  /**
   * Phase 8 Stage 4 — actor for the recorded sync event.
   * - manual sync (controller) passes `req.user.id` so the History
   *   panel shows who clicked.
   * - auto-sync (createDocument's setImmediate) passes null so the
   *   event reads as "system".
   */
  actorUserId: string | null = null
): Promise<DocumentPublic> {
  // Serialize concurrent syncs for the SAME document via a Postgres
  // advisory xact lock — parity with calculator-configs/sync.service.ts
  // (Sprint 9.L B4). Without it, two near-simultaneous sync calls — a
  // double-click that beats the disabled-button guard, or the create
  // auto-sync (setImmediate) racing a manual click — could BOTH pass the
  // findByNumber check before either wrote state back, each calling
  // `createNote` and leaking a DUPLICATE Note into the customer timeline.
  //
  // `pg_try_advisory_xact_lock` returns false (instead of blocking) when
  // the lock is already held; we surface that as a 409 so the second
  // caller renders a polite "sync already in progress" rather than
  // starting a parallel run. The lock auto-releases when the wrapping
  // transaction ends (commit OR rollback).
  return db.transaction(async tx => {
    const claim = await tx.execute<{ acquired: boolean }>(sql`
      SELECT pg_try_advisory_xact_lock(hashtext('doc-sync:' || ${number}::text)) AS acquired
    `);
    if (!claim.rows[0]?.acquired) {
      throw new ConflictError(
        "HUBSPOT_SYNC_IN_PROGRESS",
        "Another sync for this document is already in progress. Try again in a moment."
      );
    }
    return syncDocumentToHubspotLocked(number, actorUserId);
  });
}

/**
 * Internal worker invoked under the advisory lock. The outer
 * `db.transaction()` awaits this entire function before committing, so
 * the advisory xact lock is held for the FULL duration of the work
 * (createNote → associate → state write) — concurrent syncs are
 * genuinely serialised, not merely gated at entry. The worker uses the
 * global `db`/repositories for its writes (so repositories stay
 * tx-agnostic); that does NOT shorten the lock's coverage, because the
 * transaction stays open until this function resolves.
 */
async function syncDocumentToHubspotLocked(
  number: string,
  actorUserId: string | null
): Promise<DocumentPublic> {
  const document = await findByNumber(number);
  if (!document) {
    throw new NotFoundError("Document");
  }
  // Phase 8 Stage 5 — soft-deleted documents are NOT syncable. The
  // FE Sync button is hidden on the detail page when deletedAt is
  // set; this 404 catches a stale tab / direct-API caller that
  // missed the soft-delete.
  if (document.deletedAt) {
    throw new NotFoundError("Document");
  }

  if (!crmIsConfigured()) {
    throw new ValidationError(
      [{ path: ["crm"], message: `${activeCrmName()} integration is not configured.` }],
      `${activeCrmName()} not configured`
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

  // Parent company was DELETED in HubSpot (retained locally only because
  // it owns documents). There is nothing upstream to attach a Note to —
  // an association would 400 ("associations are invalid"). Fail fast with
  // a clear reason instead of creating an orphan Note + spamming HubSpot.
  // Reads BOTH era flags. `hubspotDeletedAt` is written only by the
  // HubSpot deletion webhook and freezes when HubSpot is switched off, so
  // on that alone this precheck would never fire again — and a note would
  // be posted to the card of a client the CRM says no longer exists.
  if (company.hubspotDeletedAt || company.crmDeletedAt) {
    await updateDocumentHubspotSync(document.id, {
      hubspotSyncState: "failed",
      hubspotNoteId: null
    });
    await tryRecordEvent(
      () =>
        insertDocumentEvent({
          documentId: document.id,
          eventType: "sync_failed",
          actorUserId,
          meta: { stage: "precheck", error: "parent company deleted in HubSpot" }
        }),
      {
        label: "documents:sync",
        context: { documentId: document.id, documentNumber: document.number }
      }
    );
    logger.warn(
      {
        documentId: document.id,
        documentNumber: document.number,
        hubspotCompanyId: company.hubspotCompanyId
      },
      "[documents:sync] skipped — parent company was deleted in HubSpot"
    );
    throw new ValidationError(
      [{ path: ["hubspot"], message: "parent company was deleted in HubSpot" }],
      "Cannot sync: the parent company was deleted in HubSpot."
    );
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

  // Resolve WHERE the note goes. Unchanged rule (decision D3, and the
  // same one HubSpot has always used): the deal card when the document is
  // pinned to a deal, otherwise the client card.
  //
  // Both ids are resolved because only `publishCrmNote` knows which CRM is
  // live. The monday id comes from the parallel binding chain written by
  // the remap.
  const pinnedDeal = document.hubspotDealId
    ? await findDealByHubspotId(document.hubspotDealId)
    : undefined;

  const target: { type: "deal" | "company"; hubspotId: string | null; mondayId: string | null } =
    document.hubspotDealId !== null
      ? {
          type: "deal",
          hubspotId: document.hubspotDealId,
          mondayId: pinnedDeal?.crmItemId ?? null
        }
      : {
          type: "company",
          hubspotId: company.hubspotCompanyId,
          mondayId: company.crmItemId ?? null
        };

  // Publish. In monday this is ONE call — the item id is the association —
  // so the old "note created but association failed" half-state, and the
  // whole `stage: 'associate'` recovery branch it needed, no longer exist.
  let noteId: string;
  let provider: "hubspot" | "monday";
  let targetObjectId: string;
  try {
    const published = await publishCrmNote({
      body,
      target: target.type,
      hubspotObjectId: target.hubspotId,
      mondayItemId: target.mondayId,
      documentId: document.id
    });
    noteId = published.noteId;
    provider = published.provider;
    targetObjectId = published.targetObjectId;
  } catch (err) {
    // Mark the document failed BEFORE re-throwing so the next GET shows
    // the failed badge. No note id is carried forward — nothing landed.
    await updateDocumentHubspotSync(document.id, {
      hubspotSyncState: "failed",
      hubspotNoteId: null
    });
    await tryRecordEvent(
      () =>
        insertDocumentEvent({
          documentId: document.id,
          eventType: "sync_failed",
          actorUserId,
          meta: { stage: "publish", target: target.type, error: (err as Error).message }
        }),
      {
        label: "documents:sync",
        context: { documentId: document.id, documentNumber: document.number }
      }
    );
    logger.error(
      {
        documentId: document.id,
        documentNumber: document.number,
        target: target.type,
        err: (err as Error).message
      },
      "[documents:sync] publishing the CRM note failed — document marked failed"
    );
    throw err;
  }

  // Step 3: persist the new state. Single UPDATE — no TX needed
  // because the only relational invariant here is "noteId points to
  // a real HubSpot note", and HubSpot already confirmed that.
  const updated = await updateDocumentHubspotSync(document.id, {
    hubspotSyncState: "synced",
    hubspotNoteId: noteId,
    crmNoteProvider: provider,
    crmNoteTarget: target.type
  });
  if (!updated) {
    // Pathological: the document row vanished between the find and
    // the update. Surface as a 500 (would only happen during a
    // concurrent delete in Stage 5).
    throw new Error(
      `[documents:sync] document ${document.number} disappeared mid-sync`
    );
  }

  // Decision D16 — record this note in the ledger. `hubspot_note_id`
  // above is only the MOST RECENT note; a re-sync mints another one
  // (decision D14, unchanged from HubSpot behaviour). Teardown enumerates
  // the ledger, so every note ever created for this document is removed
  // on delete instead of just the newest — otherwise the older ones stay
  // on a live client card forever, carrying the document number, the
  // company name and a link into our SPA.
  await tryRecordEvent(
    () =>
      insertCrmNote({
        documentId: updated.id,
        provider,
        noteId,
        target: target.type,
        targetObjectId
      }),
    {
      label: "documents:sync:ledger",
      context: { documentId: updated.id, noteId }
    }
  );

  // Phase 8 Stage 4 — record the success on the History timeline.
  await tryRecordEvent(
    () =>
      insertDocumentEvent({
        documentId: updated.id,
        eventType: "synced_to_hubspot",
        actorUserId,
        meta: { noteId, provider, target: target.type }
      }),
    {
      label: "documents:sync",
      context: { documentId: updated.id, noteId }
    }
  );

  logger.info(
    {
      documentId: updated.id,
      documentNumber: updated.number,
      noteId,
      target: target.type
    },
    "[documents:sync] document synced to the CRM"
  );

  // Re-fetch through the standard service so the public DTO carries
  // the same companyName-JOIN shape (Sprint 7.x) consumers expect.
  return getDocumentByNumber(updated.number);
}
