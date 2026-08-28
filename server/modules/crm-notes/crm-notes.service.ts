/**
 * Tear down the CRM notes belonging to a document or calc-config.
 *
 * WHY THIS IS NOT `deleteNote(row.hubspotNoteId)` (decision D16):
 *
 * A manual re-sync mints a NEW note each time (D14 — the same policy
 * HubSpot has always had), but the row only remembers the most recent id.
 * Deleting a document that was synced three times therefore used to
 * remove one note and leave two behind — permanently, on a live client
 * card, each carrying the document number, the company name, the author's
 * email and a link into our SPA. In HubSpot those strays were buried in
 * an activity feed; in monday they sit on the card the sales team reads
 * every day.
 *
 * So teardown enumerates the `crm_notes` ledger. Each note is attempted
 * independently: one failure does not abandon the rest, and every outcome
 * is recorded so a retry only re-attempts what is still standing.
 */

import { env } from "../../config/env";
import { logger } from "../../middleware/logger";
import { CrmUnreachableError } from "../../shared/errors";
import { hubspot } from "../hubspot/hubspot.client";
import { monday } from "../monday/monday.client";
import {
  insertCrmNote,
  listLiveNotesForCalcConfig,
  listLiveNotesForDocument,
  markCrmNoteTornDown,
  recordCrmNoteTeardownError
} from "./crm-notes.repository";
import type { CrmNote } from "../../db/schema";

export interface TeardownOutcome {
  /** Notes we tried to remove (those held by the ACTIVE provider). */
  attempted: number;
  /** Notes confirmed gone upstream. */
  tornDown: number;
  /** First failure, if any — the caller surfaces it to the operator. */
  error: Error | null;
}

/**
 * Remove one note from whichever CRM holds it.
 *
 * A "already gone" response counts as success: teardown is idempotent by
 * design, so an operator who deleted the note by hand in the CRM UI must
 * still be able to delete the document here.
 */
async function deleteOne(note: CrmNote): Promise<void> {
  switch (note.provider) {
    case "hubspot":
      // `deleteNote` already swallows a 404 as already-deleted.
      await hubspot.deleteNote(note.noteId);
      return;
    case "monday":
      try {
        await monday.deleteUpdate(note.noteId);
      } catch (err) {
        // "Already gone" must count as success, or a note the operator
        // deleted by hand in the monday UI would block the document
        // delete forever. monday reports this as a GraphQL error rather
        // than a 404, so it is detected by message.
        const message = err instanceof Error ? err.message : String(err);
        if (/not\s*found|does not exist|invalid.*update/i.test(message)) {
          logger.warn(
            { noteId: note.noteId },
            "[crm-notes] monday update already gone — treating the tear-down as done"
          );
          return;
        }
        throw err;
      }
      return;
    default: {
      const exhaustive: never = note.provider;
      throw new Error(`unknown CRM note provider: ${String(exhaustive)}`);
    }
  }
}

async function tearDown(notes: CrmNote[], context: Record<string, unknown>): Promise<TeardownOutcome> {
  let tornDown = 0;
  let firstError: Error | null = null;

  for (const note of notes) {
    try {
      await deleteOne(note);
      await markCrmNoteTornDown(note.id);
      tornDown += 1;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      // Record per-note so a retry knows exactly which ones are left and
      // why — without this, a partial failure looks identical to a total
      // one and the operator has no way to tell.
      await recordCrmNoteTeardownError(note.id, error.message);
      logger.error(
        { ...context, noteId: note.noteId, provider: note.provider, err: error.message },
        "[crm-notes] tear-down failed for one note — continuing with the rest"
      );
      firstError ??= error;
    }
  }

  return { attempted: notes.length, tornDown, error: firstError };
}

/** Only notes held by the CRM we are actually talking to are reachable. */
function reachable(notes: CrmNote[]): CrmNote[] {
  return notes.filter(n => n.provider === env.CRM_PROVIDER);
}

/**
 * `fallbackNoteId` covers rows whose ledger entry is missing — a note
 * created before the ledger existed and not caught by the seeding
 * migration, or a best-effort ledger insert that failed after the note
 * was already created upstream. Without it those notes would be silently
 * skipped, which is the exact orphan this design exists to prevent.
 */
async function withFallback(
  notes: CrmNote[],
  fallback: { noteId: string | null; provider: string | null; target: string | null },
  owner: { documentId?: string; calculatorConfigId?: string }
): Promise<CrmNote[]> {
  if (!fallback.noteId || fallback.provider !== env.CRM_PROVIDER) return notes;
  if (notes.some(n => n.noteId === fallback.noteId)) return notes;

  logger.warn(
    { ...owner, noteId: fallback.noteId },
    "[crm-notes] row pointer references a note with no ledger entry — recording it so it is not orphaned"
  );
  // Persist FIRST, then re-read, so the row we hand to tear-down carries
  // its REAL primary key. Constructing it in memory with a placeholder id
  // meant `markCrmNoteTornDown(note.id)` updated nothing: the note was
  // removed upstream but stayed "live" in the ledger forever, so every
  // later delete retried it and every ops query over-counted.
  await insertCrmNote({
    documentId: owner.documentId ?? null,
    calculatorConfigId: owner.calculatorConfigId ?? null,
    provider: fallback.provider as "hubspot" | "monday",
    noteId: fallback.noteId,
    target: (fallback.target ?? "company") as "company" | "agent" | "deal",
    // Unknown at this point — the pointer records the id, not the card it
    // sits on. Teardown does not need it; it deletes by note id.
    targetObjectId: ""
  });
  const persisted = owner.documentId
    ? await listLiveNotesForDocument(owner.documentId)
    : await listLiveNotesForCalcConfig(owner.calculatorConfigId as string);
  return reachable(persisted);
}

/**
 * Post a note to whichever CRM is active, and return what was created so
 * the caller can record it in the ledger and in the row pointer.
 *
 * The caller decides the TARGET (deal when the row is pinned to one, else
 * the client card — decision D3, unchanged from HubSpot behaviour) and
 * passes the id for BOTH systems, because only this function knows which
 * one is live.
 */
/**
 * Is the CRM we are ACTUALLY using configured?
 *
 * Every call site used to ask `hubspot.isConfigured()` unconditionally.
 * That made the monday era unusable in exactly the configuration
 * `env.ts` now blesses — CRM_PROVIDER=monday with no HubSpot token —
 * because sync would refuse with "HubSpot integration is not configured"
 * and delete would refuse to tear down a monday update.
 */
export function crmIsConfigured(): boolean {
  return env.CRM_PROVIDER === "monday" ? monday.isConfigured() : hubspot.isConfigured();
}

/** Name of the active CRM, for operator-facing error messages. */
export function activeCrmName(): string {
  return env.CRM_PROVIDER === "monday" ? "monday.com" : "HubSpot";
}

export async function publishCrmNote(input: {
  body: string;
  target: "company" | "agent" | "deal";
  /** HubSpot object id — used when HubSpot is the active CRM. */
  hubspotObjectId: string | null;
  /** monday item id — used when monday is the active CRM. */
  mondayItemId: string | null;
  /** Owner, so a half-created note can still be recorded in the ledger. */
  documentId?: string | null;
  calculatorConfigId?: string | null;
}): Promise<{ provider: "hubspot" | "monday"; noteId: string; targetObjectId: string }> {
  if (env.CRM_PROVIDER === "monday") {
    if (!input.mondayItemId) {
      // Refuse rather than fall back to HubSpot: a note silently written
      // to the wrong CRM is worse than a visible failure the operator can
      // retry once the row is bound.
      // A 502 with the operator-facing reason, not a bare Error: the sync
      // services rethrow what they catch, so a plain Error surfaces as a
      // generic 500 and the actionable part ("run the remap first")
      // never reaches the person who can act on it.
      throw new CrmUnreachableError(
        "This row is not bound to a monday item yet — run the remap before syncing it.",
        { reason: "unbound" }
      );
    }
    const created = await monday.createUpdate({ itemId: input.mondayItemId, body: input.body });
    return { provider: "monday", noteId: created.id, targetObjectId: input.mondayItemId };
  }

  if (!input.hubspotObjectId) {
    throw new CrmUnreachableError(
      "Cannot create a HubSpot Note — this row carries no HubSpot object id.",
      { reason: "unbound" }
    );
  }
  const note = await hubspot.createNote({ body: input.body });
  // HubSpot needs a SECOND call to attach the note to anything; monday
  // does not, which is why this branch is the longer one.
  try {
    await hubspot.associateNoteWith({
      noteId: note.id,
      toObjectType: input.target === "deal" ? "deal" : "company",
      toObjectId: input.hubspotObjectId
    });
  } catch (err) {
    // The Note EXISTS upstream — only the association failed. Record it
    // in the ledger BEFORE rethrowing, or the id is lost with the thrown
    // error and the note becomes an unreachable orphan on the customer's
    // timeline that no retry and no delete can ever clean up. (The
    // pre-migration code kept it by persisting `hubspotNoteId` on the
    // failed row; routing through the ledger preserves that guarantee
    // and additionally survives a re-sync.)
    try {
      await insertCrmNote({
        documentId: input.documentId ?? null,
        calculatorConfigId: input.calculatorConfigId ?? null,
        provider: "hubspot",
        noteId: note.id,
        target: input.target,
        targetObjectId: input.hubspotObjectId
      });
    } catch (ledgerErr) {
      // The rescue must not itself lose what it is rescuing. If the ledger
      // write fails we still have to surface the note id somewhere a human
      // can find it, because the association error is about to propagate
      // and the id exists nowhere else.
      logger.error(
        {
          noteId: note.id,
          target: input.target,
          targetObjectId: input.hubspotObjectId,
          ledgerErr: (ledgerErr as Error).message
        },
        "[crm-notes] ORPHANED NOTE — a HubSpot Note was created, its association failed, AND the ledger write failed. This note id exists only in this log line; it must be removed by hand."
      );
    }
    logger.error(
      { noteId: note.id, target: input.target, err: (err as Error).message },
      "[crm-notes] HubSpot Note created but association failed — recorded in the ledger so tear-down can still reach it"
    );
    throw err;
  }
  return { provider: "hubspot", noteId: note.id, targetObjectId: input.hubspotObjectId };
}

/**
 * Does this row have anything the ACTIVE CRM could still tear down?
 *
 * Replaces the old entry condition, which was a whitelist of sync states
 * (`'synced' | 'delete_failed'`). That whitelist silently stranded two
 * real states:
 *   - `failed` WITH a note id — produced when HubSpot created the note but
 *     the association call failed. One such calc-config exists in prod.
 *   - `delete_pending` — a row whose teardown was interrupted mid-flight.
 * Both hold a live upstream note that the delete path refused to touch,
 * so deleting the row left the note behind forever.
 *
 * Asking the LEDGER instead makes the state machine irrelevant to the
 * question "is there a note out there?", which is the only thing that
 * actually matters here.
 */
export async function hasReachableNotes(owner: {
  documentId?: string;
  calculatorConfigId?: string;
  pointerNoteId: string | null;
  pointerProvider: string | null;
}): Promise<boolean> {
  if (owner.pointerNoteId && owner.pointerProvider === env.CRM_PROVIDER) return true;
  const ledger = owner.documentId
    ? await listLiveNotesForDocument(owner.documentId)
    : await listLiveNotesForCalcConfig(owner.calculatorConfigId as string);
  return reachable(ledger).length > 0;
}

export async function tearDownDocumentNotes(
  documentId: string,
  fallback: { noteId: string | null; provider: string | null; target: string | null },
  context: Record<string, unknown> = {}
): Promise<TeardownOutcome> {
  const ledger = reachable(await listLiveNotesForDocument(documentId));
  const notes = await withFallback(ledger, fallback, { documentId });
  return tearDown(notes, { documentId, ...context });
}

export async function tearDownCalcConfigNotes(
  calculatorConfigId: string,
  fallback: { noteId: string | null; provider: string | null; target: string | null },
  context: Record<string, unknown> = {}
): Promise<TeardownOutcome> {
  const ledger = reachable(await listLiveNotesForCalcConfig(calculatorConfigId));
  const notes = await withFallback(ledger, fallback, { calculatorConfigId });
  return tearDown(notes, { calculatorConfigId, ...context });
}
