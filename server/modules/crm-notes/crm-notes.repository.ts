/**
 * `crm_notes` repository — the note ledger (decision D16).
 *
 * Teardown reads THIS table rather than the single `hubspot_note_id`
 * pointer, because a re-sync mints a new note every time (D14) while the
 * pointer only remembers the most recent one. See server/db/schema/crm-notes.ts
 * for the full rationale.
 */

import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { crmNotes, type CrmNote, type NewCrmNote } from "../../db/schema";
import type { DbOrTx } from "../../db/client";

/**
 * Record a freshly created note. Idempotent on (provider, note_id): a
 * retry that re-sends the same note id is absorbed rather than
 * duplicating the ledger row.
 */
export async function insertCrmNote(row: NewCrmNote, tx: DbOrTx = db): Promise<void> {
  await tx.insert(crmNotes).values(row).onConflictDoNothing({
    target: [crmNotes.provider, crmNotes.noteId]
  });
}

/**
 * Every note still standing for a document — what teardown must remove.
 * Ordered oldest-first so a partial failure leaves the newest (the one
 * the UI still points at) for last, keeping the pointer meaningful.
 */
export async function listLiveNotesForDocument(documentId: string): Promise<CrmNote[]> {
  return db
    .select()
    .from(crmNotes)
    .where(and(eq(crmNotes.documentId, documentId), isNull(crmNotes.tornDownAt)))
    .orderBy(crmNotes.createdAt);
}

/** Same, for a calculator config. */
export async function listLiveNotesForCalcConfig(calcConfigId: string): Promise<CrmNote[]> {
  return db
    .select()
    .from(crmNotes)
    .where(and(eq(crmNotes.calculatorConfigId, calcConfigId), isNull(crmNotes.tornDownAt)))
    .orderBy(crmNotes.createdAt);
}

/**
 * Mark a note as removed upstream. The row is KEPT — the ledger is an
 * audit trail, so it must outlive the artifact it describes.
 */
export async function markCrmNoteTornDown(id: string): Promise<void> {
  await db
    .update(crmNotes)
    .set({ tornDownAt: new Date(), lastError: null })
    .where(eq(crmNotes.id, id));
}

/** Record a failed teardown attempt so the operator retry has context. */
export async function recordCrmNoteTeardownError(id: string, message: string): Promise<void> {
  await db
    .update(crmNotes)
    .set({ lastError: message.slice(0, 500) })
    .where(eq(crmNotes.id, id));
}
