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

import { findCompanyById } from "../companies/companies.repository";
import { findUserById } from "../users/users.repository";
import {
  HubspotUnreachableError,
  NotFoundError,
  ValidationError
} from "../../shared/errors";
import { logger } from "../../middleware/logger";
import { hubspot } from "../hubspot/hubspot.client";
import { buildHubspotNoteBody } from "../documents/note-builder";
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
  id: string
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

  // Step 1: create Note.
  let noteId: string;
  try {
    const note = await hubspot.createNote({ body });
    noteId = note.id;
  } catch (err) {
    await updateCalculatorConfigHubspotSync(calc.id, {
      hubspotSyncState: "failed",
      hubspotNoteId: null
    });
    logger.error(
      {
        calculatorConfigId: calc.id,
        err: (err as Error).message
      },
      "[calc-config:sync] createNote failed — calc-config marked failed"
    );
    throw err;
  }

  // Step 2: associate. Deal preferred over Company.
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
