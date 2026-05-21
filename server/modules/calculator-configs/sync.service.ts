/**
 * Phase 9.I — HubSpot Note write-back for calc-configs.
 *
 * Operator brief (2026-05-21):
 *   - Sync each calc-config to HubSpot exactly ONCE on creation.
 *   - Auto-saves (PUT) update ONLY the local row — they do NOT
 *     touch HubSpot. The Note's `Link` opens our SPA which always
 *     renders the freshest state, so there's nothing meaningful to
 *     re-push to HubSpot on every tick.
 *   - When the operator explicitly clicks the manual "Sync to
 *     HubSpot" button on /calc/:id → re-create the Note (creates a
 *     fresh Note each call, just like documents). The previous
 *     Note stays in HubSpot as an audit trail; this calc-config's
 *     `hubspot_note_id` now points to the most recent.
 *
 * Association preference mirrors the documents flow: deal first
 * (when `hubspotDealId` is set on the calc-config), company as
 * fallback. The Note body uses the new Phase 9.H one-liner format.
 */

import { sql } from "drizzle-orm";
import { db } from "../../db/client";
import { findCompanyById } from "../companies/companies.repository";
import { findUserById } from "../users/users.repository";
import {
  ConflictError,
  HubspotUnreachableError,
  NotFoundError,
  ValidationError
} from "../../shared/errors";
import { logger } from "../../middleware/logger";
import { hubspot } from "../hubspot/hubspot.client";
import { buildHubspotNoteBody } from "../../shared/hubspot/note-builder";
import { insertCalcConfigEvent } from "../events/events.repository";
import { tryRecordEvent } from "../events/events.helpers";
import {
  findById,
  updateCalculatorConfigHubspotSync
} from "./calculator-configs.repository";
import type { CalculatorConfigPublic } from "./calculator-configs.schemas";

/**
 * Sync entrypoint for calc-configs. Returns the updated public DTO
 * so the controller (and the auto-sync background path) can ship
 * the new state to the operator UI for the badge update.
 *
 * Throws on:
 *   - Unknown calc id (404)
 *   - HubSpot not configured (400) — guards the dev path where the
 *     token is absent.
 *   - Any HubSpot upstream failure (502) — `state='failed'` persisted
 *     BEFORE the throw so the next GET re-renders with the failed
 *     badge.
 */
export async function syncCalculatorConfigToHubspot(
  id: string,
  /**
   * Phase 8 Stage 4 — actor for the recorded sync event.
   * - manual sync (controller) passes `req.user.id`.
   * - auto-sync from createCalculatorConfig's setImmediate passes
   *   `null` so the event reads as "system".
   */
  actorUserId: string | null = null
): Promise<CalculatorConfigPublic> {
  // Sprint 9.L B4 — serialize concurrent Sync clicks for the same
  // calc via a Postgres advisory transaction lock keyed on the
  // calc id. Without this, two clicks landing in the same event
  // loop tick could both pass the findById → shouldPatch check
  // before either had finished writing back state — duplicating
  // createNote calls and leaking duplicate Notes into HubSpot.
  //
  // `pg_try_advisory_xact_lock` returns false instead of blocking
  // when the lock is already held; we surface that as a 409 so the
  // operator's second click renders a polite "sync already in
  // progress" error rather than starting a parallel run.
  return db.transaction(async tx => {
    const claim = await tx.execute<{ acquired: boolean }>(sql`
      SELECT pg_try_advisory_xact_lock(hashtext('calc-sync:' || ${id}::text)) AS acquired
    `);
    if (!claim.rows[0]?.acquired) {
      throw new ConflictError(
        "HUBSPOT_SYNC_IN_PROGRESS",
        "Another sync for this calculator is already in progress. Try again in a moment."
      );
    }
    return syncCalculatorConfigToHubspotLocked(id, actorUserId);
  });
}

/**
 * Sprint 9.L B4 — internal worker invoked under the advisory lock.
 * Split out so the lock-acquire/release scope is small and obvious
 * at the entrypoint, while the existing flow continues to read +
 * write via the global `db` (the lock guards CONCURRENT entries,
 * not the per-statement transactionality of the writes).
 */
async function syncCalculatorConfigToHubspotLocked(
  id: string,
  actorUserId: string | null
): Promise<CalculatorConfigPublic> {
  const calc = await findById(id);
  if (!calc) throw new NotFoundError("Calculator config");

  if (!hubspot.isConfigured()) {
    throw new ValidationError(
      [{ path: ["hubspot"], message: "HubSpot integration is not configured." }],
      "HubSpot not configured"
    );
  }

  // Parent company lookup (defence in depth — companyId is non-null FK).
  const company = await findCompanyById(calc.companyId);
  if (!company) throw new NotFoundError("Parent company");

  // Created-by operator for the Note header.
  const actor = await findUserById(calc.createdByUserId);
  if (!actor) throw new NotFoundError("Calculator author");

  // Identifier shown in the Note (per operator brief 2026-05-21):
  // calc title if present, else "(untitled)" so the line still
  // reads naturally.
  const identifier = calc.title?.trim() ? calc.title.trim() : "(untitled)";

  const body = buildHubspotNoteBody({
    kind: "calculator",
    identifier,
    companyName: company.name,
    createdAt: calc.createdAt,
    actor: { displayName: actor.displayName, email: actor.email },
    detailPath: `/calc/${encodeURIComponent(calc.id)}`
  });

  // Phase 9.K — one-Note-per-calc semantics. Decide whether to
  // PATCH the existing Note or CREATE a new one:
  //   - If we already have a `hubspot_note_id` AND last sync state
  //     was "synced" → PATCH (refresh body in place).
  //   - Otherwise → CREATE (first sync, or recovery after a failure
  //     that left the previous noteId stale).
  //   - If PATCH returns 404 (operator deleted the Note in HubSpot
  //     UI) → fall back to CREATE so we self-heal.
  const shouldPatch =
    calc.hubspotNoteId !== null && calc.hubspotSyncState === "synced";
  let noteId: string;
  let isNewNote = false;

  if (shouldPatch && calc.hubspotNoteId) {
    try {
      await hubspot.updateNote({ noteId: calc.hubspotNoteId, body });
      noteId = calc.hubspotNoteId;
    } catch (err) {
      // 404 = Note was manually deleted in HubSpot. Recover by
      // creating a fresh one + re-running association. Any other
      // upstream error → mark failed and bail.
      const status =
        err instanceof HubspotUnreachableError &&
        typeof err.details === "object" &&
        err.details !== null &&
        "status" in err.details
          ? (err.details as { status?: number }).status
          : undefined;
      if (status === 404) {
        logger.warn(
          { calculatorConfigId: calc.id, staleNoteId: calc.hubspotNoteId },
          "[calc-config:sync] existing Note 404 in HubSpot — creating fresh one"
        );
        // Fall through to the CREATE branch below by clearing the
        // shouldPatch flag.
        const note = await hubspot.createNote({ body });
        noteId = note.id;
        isNewNote = true;
      } else {
        await updateCalculatorConfigHubspotSync(calc.id, {
          hubspotSyncState: "failed",
          hubspotNoteId: calc.hubspotNoteId
        });
        // Phase 8 Stage 4 — record the PATCH failure on the timeline.
        // Sprint 9.M D1 — shared `tryRecordEvent` helper.
        await tryRecordEvent(
          () =>
            insertCalcConfigEvent({
              calculatorConfigId: calc.id,
              eventType: "sync_failed",
              actorUserId,
              meta: {
                stage: "updateNote",
                noteId: calc.hubspotNoteId,
                error: (err as Error).message
              }
            }),
          {
            label: "calc-config:sync",
            context: { calculatorConfigId: calc.id, noteId: calc.hubspotNoteId }
          }
        );
        logger.error(
          {
            calculatorConfigId: calc.id,
            noteId: calc.hubspotNoteId,
            err: (err as Error).message
          },
          "[calc-config:sync] updateNote (PATCH) failed — calc-config marked failed"
        );
        throw err;
      }
    }
  } else {
    // First-time sync or recovery from a previous failure.
    try {
      const note = await hubspot.createNote({ body });
      noteId = note.id;
      isNewNote = true;
    } catch (err) {
      await updateCalculatorConfigHubspotSync(calc.id, {
        hubspotSyncState: "failed",
        hubspotNoteId: null
      });
      await tryRecordEvent(
        () =>
          insertCalcConfigEvent({
            calculatorConfigId: calc.id,
            eventType: "sync_failed",
            actorUserId,
            meta: { stage: "createNote", error: (err as Error).message }
          }),
        {
          label: "calc-config:sync",
          context: { calculatorConfigId: calc.id }
        }
      );
      logger.error(
        {
          calculatorConfigId: calc.id,
          err: (err as Error).message
        },
        "[calc-config:sync] createNote failed — calc-config marked failed"
      );
      throw err;
    }
  }

  // Step 2: associate ONLY when we just created a fresh Note. A
  // PATCH'd existing Note already has its association from the
  // original CREATE — re-asserting would be a no-op (HubSpot
  // returns 409 on duplicate associations).
  const target =
    calc.hubspotDealId !== null
      ? { type: "deal" as const, id: calc.hubspotDealId }
      : { type: "company" as const, id: company.hubspotCompanyId };

  if (isNewNote) {
    try {
      await hubspot.associateNoteWith({
        noteId,
        toObjectType: target.type,
        toObjectId: target.id
      });
    } catch (err) {
      await updateCalculatorConfigHubspotSync(calc.id, {
        hubspotSyncState: "failed",
        hubspotNoteId: noteId
      });
      await tryRecordEvent(
        () =>
          insertCalcConfigEvent({
            calculatorConfigId: calc.id,
            eventType: "sync_failed",
            actorUserId,
            meta: {
              stage: "associate",
              noteId,
              target,
              error: (err as Error).message
            }
          }),
        {
          label: "calc-config:sync",
          context: { calculatorConfigId: calc.id, noteId }
        }
      );
      logger.error(
        {
          calculatorConfigId: calc.id,
          noteId,
          associationTarget: target,
          err: (err as Error).message
        },
        "[calc-config:sync] note created but association failed"
      );
      throw err instanceof HubspotUnreachableError
        ? err
        : new HubspotUnreachableError(
            `Note created (${noteId}) but association failed: ${(err as Error).message}`,
            { noteId, target }
          );
    }
  }

  // Step 3: persist success state.
  const updated = await updateCalculatorConfigHubspotSync(calc.id, {
    hubspotSyncState: "synced",
    hubspotNoteId: noteId
  });
  if (!updated) {
    // Pathological race — row vanished between find and update.
    throw new Error(
      `[calc-config:sync] calc-config ${calc.id} disappeared mid-sync`
    );
  }

  // Phase 8 Stage 4 — record the success on the History timeline.
  await tryRecordEvent(
    () =>
      insertCalcConfigEvent({
        calculatorConfigId: updated.id,
        eventType: "synced_to_hubspot",
        actorUserId,
        meta: { noteId, target, isNewNote }
      }),
    {
      label: "calc-config:sync",
      context: { calculatorConfigId: updated.id, noteId }
    }
  );

  logger.info(
    {
      calculatorConfigId: updated.id,
      noteId,
      associationTarget: target
    },
    "[calc-config:sync] calc-config synced to HubSpot"
  );

  // Re-fetch via the standard service so the public DTO includes
  // the companyName JOIN (matches the read shape consumers expect).
  // Lazy import to break the calc-configs.service ↔ sync.service
  // dependency cycle (the service imports the sync controller).
  const { getCalculatorConfig } = await import("./calculator-configs.service");
  return getCalculatorConfig(updated.id);
}
