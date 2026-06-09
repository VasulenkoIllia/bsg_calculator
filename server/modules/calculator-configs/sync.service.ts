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
  // loop tick could both pass the findById check before either had
  // finished writing back state — duplicating createNote calls and
  // leaking duplicate Notes into HubSpot.
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
 * Sprint 9.L B4 — internal worker invoked under the advisory lock. The
 * outer `db.transaction()` awaits this entire function before
 * committing, so the advisory xact lock is held for the FULL duration
 * of the work (createNote → associate → state write) — concurrent
 * syncs are genuinely serialised, not merely gated at entry. The worker
 * uses the global `db`/repositories for its writes (so repositories
 * stay tx-agnostic); that does NOT shorten the lock's coverage, because
 * the transaction stays open until this function resolves.
 */
async function syncCalculatorConfigToHubspotLocked(
  id: string,
  actorUserId: string | null
): Promise<CalculatorConfigPublic> {
  const calc = await findById(id);
  if (!calc) throw new NotFoundError("Calculator config");

  // Cycle 2 — never push a soft-deleted calc to HubSpot. The delete flow
  // already tore the Note down; re-creating it here (e.g. a queued
  // auto-sync that lost the race with a delete) would resurrect an orphan
  // on the customer timeline. Surface as 404 so the row reads "gone".
  if (calc.deletedAt) throw new NotFoundError("Calculator config");

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

  // Cycle 2 (2026-06-07, operator-approved) — manual sync ALWAYS creates a
  // FRESH Note, full parity with the documents flow. The previous Note
  // stays in HubSpot as an audit trail; this calc-config's hubspot_note_id
  // points to the most recent. This replaces the Phase 9.K patch-in-place
  // (updateNote) behavior so the /calc/:id "Sync again" confirm dialog's
  // "creates a NEW HubSpot Note" wording is accurate.

  // Step 1: create the Note (no association yet).
  let noteId: string;
  try {
    const note = await hubspot.createNote({ body });
    noteId = note.id;
  } catch (err) {
    // Mark failed BEFORE re-throwing so the next GET shows the failed
    // badge. Don't carry an old noteId forward — the new Note never landed.
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

  // Step 2: associate the fresh Note. Prefer Deal when the calc is pinned
  // to one, else the parent company (mirrors documents).
  const target =
    calc.hubspotDealId !== null
      ? { type: "deal" as const, id: calc.hubspotDealId }
      : { type: "company" as const, id: company.hubspotCompanyId };

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
        meta: { noteId, target }
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
