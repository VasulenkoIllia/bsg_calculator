/**
 * Calculator-configs service.
 *
 * Pure business orchestration over the repository:
 *   - Cross-company-deal validation on POST/PUT (a deal MUST belong
 *     to the same company as the config — otherwise an operator
 *     could accidentally pin a config to a deal of a different
 *     customer).
 *   - Public DTO projection (date → ISO strings).
 *   - 404 on missing config.
 *
 * Auth is handled at the route level (requireAuth); the service
 * receives `actorUserId` from the controller for the audit column
 * `created_by_user_id`.
 */

import { sql } from "drizzle-orm";
import { db } from "../../db/client";
import { env } from "../../config/env";
import { logger } from "../../middleware/logger";
import { parseDtoOrInternalError } from "../../shared/dto-parse";
import { buildSortedPage, type PageResult } from "../../shared/sorted-pagination";
import {
  ConflictError,
  HubspotUnreachableError,
  InternalError,
  NotFoundError,
  ValidationError
} from "../../shared/errors";
import { ensureDealBelongsToCompany } from "../../shared/deal-guard";
import { insertCalcConfigEvent } from "../events/events.repository";
import { tryRecordEvent } from "../events/events.helpers";
import { hubspot } from "../hubspot/hubspot.client";
import type { CalculatorConfig } from "../../db/schema";
import type { CalculatorConfigWithCompanyName } from "./calculator-configs.repository";
import {
  cursorValueForRow,
  findById,
  insertCalculatorConfig,
  listCalculatorConfigs,
  restoreCalculatorConfig as restoreCalculatorConfigRow,
  softDeleteCalculatorConfig,
  updateCalculatorConfig as updateRow,
  updateCalculatorConfigHubspotSync,
  type ListCalculatorConfigsArgs
} from "./calculator-configs.repository";
import {
  calculatorConfigPublicSchema,
  type CalculatorConfigPublic,
  type CreateCalculatorConfigRequest,
  type DeleteCalculatorConfigRequest,
  type UpdateCalculatorConfigRequest
} from "./calculator-configs.schemas";

/**
 * Single shared toPublic that works for both shapes:
 *   - plain CalculatorConfig (create / update / get-by-id) — no
 *     companyName JOIN, field omitted from the response.
 *   - CalculatorConfigWithCompanyName (list) — JOIN result, name
 *     surfaces in the response so consumers can render it without
 *     a second fetch.
 *
 * The DTO schema has `companyName` as optional; omitting it on the
 * single-row endpoints is a conscious wire-cost choice (no JOIN on
 * those reads).
 */
function toPublic(
  row: CalculatorConfig | CalculatorConfigWithCompanyName
): CalculatorConfigPublic {
  const companyName = "companyName" in row ? row.companyName : undefined;
  // Sprint 9.N — `lastEvent` from the listing path's LATERAL JOIN
  // is forwarded to the public DTO so the FE "Last action" column
  // can render `actor · event · time-ago` without an N+1.
  const lastEvent = "lastEvent" in row ? row.lastEvent : null;
  // Sprint 9.X.A — listing rows carry the creator's display surrogate
  // via the LEFT JOIN added on `users.id = created_by_user_id`. Single
  // -row endpoints (create / update / get-by-id) don't JOIN, so we
  // surface null and the FE renders no subline.
  const createdBy = "createdBy" in row ? row.createdBy : null;
  return parseDtoOrInternalError(
    calculatorConfigPublicSchema,
    {
      id: row.id,
      companyId: row.companyId,
      ...(companyName !== undefined ? { companyName } : {}),
      hubspotDealId: row.hubspotDealId,
      title: row.title,
      payload: row.payload,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      // Phase 9.I — HubSpot sync state surfaced on the public DTO.
      hubspotNoteId: row.hubspotNoteId,
      hubspotSyncState: row.hubspotSyncState,
      // Cycle 2 — soft-delete mirror. Drives the "Deleted" badge + reason
      // + restore button in the Saved-calculators list.
      deletedAt: row.deletedAt ? row.deletedAt.toISOString() : null,
      deletionReason: row.deletionReason ?? null,
      createdBy,
      lastEvent: lastEvent
        ? {
            eventType: lastEvent.eventType,
            // Sprint 9.N — same defensive Date() wrap as documents
            // toPublic (LATERAL `sql<Date | null>` can drop the
            // node-pg parser).
            createdAt: new Date(lastEvent.createdAt).toISOString(),
            actorUserId: lastEvent.actorUserId,
            actorDisplayName: lastEvent.actorDisplayName,
            actorEmail: lastEvent.actorEmail
          }
        : null
    },
    "calculator-configs.toPublic"
  );
}

export type CalculatorConfigListPage = PageResult<CalculatorConfigPublic>;

export async function createCalculatorConfig(
  body: CreateCalculatorConfigRequest,
  actorUserId: string
): Promise<CalculatorConfigPublic> {
  await ensureDealBelongsToCompany(body.hubspotDealId, body.companyId);

  // Phase 8 Stage 4 — atomically write the calc + its 'created'
  // event in one TX so rollback wipes both together and the History
  // panel never shows a calc-config without an initial creation row.
  const row = await db.transaction(async tx => {
    const inserted = await insertCalculatorConfig(
      {
        companyId: body.companyId,
        hubspotDealId: body.hubspotDealId ?? null,
        title: body.title ?? null,
        payload: body.payload,
        createdByUserId: actorUserId
      },
      tx
    );
    await insertCalcConfigEvent(
      {
        calculatorConfigId: inserted.id,
        eventType: "created",
        actorUserId,
        meta: { title: inserted.title }
      },
      tx
    );
    return inserted;
  });

  // Phase 9.I — auto-sync to HubSpot AFTER the row is committed.
  // Same fire-and-forget pattern as documents (Phase 9.G): the
  // operator gets 201 immediately; HubSpot Note creation happens
  // in the background. Subsequent auto-saves (PUT) DO NOT trigger
  // sync per operator brief — the Note's link opens our SPA which
  // always renders the freshest state, so there's nothing to push.
  if (env.AUTO_SYNC_TO_HUBSPOT) {
    const calcId = row.id;
    setImmediate(() => {
      // Sprint 9.M B4 — added `.catch(importErr)` so a dynamic-import
      // failure surfaces as ERROR in logs rather than getting
      // silently dropped by `void`.
      void import("./sync.service")
        .then(async ({ syncCalculatorConfigToHubspot }) => {
          try {
            await syncCalculatorConfigToHubspot(calcId);
          } catch (err) {
            logger.info(
              { calculatorConfigId: calcId, err: (err as Error).message },
              "[calc-config:auto-sync] background sync failed; operator can Retry from /calc/:id"
            );
          }
        })
        .catch(importErr => {
          logger.error(
            { calculatorConfigId: calcId, err: (importErr as Error).message },
            "[calc-config:auto-sync] dynamic import of sync.service failed — auto-sync NOT attempted"
          );
        });
    });
  }

  return toPublic(row);
}

export async function getCalculatorConfig(id: string): Promise<CalculatorConfigPublic> {
  const row = await findById(id);
  if (!row) throw new NotFoundError("Calculator config");
  return toPublic(row);
}

export async function updateCalculatorConfigById(
  id: string,
  body: UpdateCalculatorConfigRequest
): Promise<CalculatorConfigPublic> {
  // Verify the config exists FIRST so we can run the cross-company
  // check against the actual companyId (the request body doesn't
  // carry companyId for PUT — only fields the operator can change).
  const existing = await findById(id);
  if (!existing) throw new NotFoundError("Calculator config");

  await ensureDealBelongsToCompany(body.hubspotDealId, existing.companyId);

  // Sprint 6.6 bug fix: PARTIAL update semantics — only patch fields
  // the caller explicitly sent. Previously `body.title ?? null` /
  // `body.hubspotDealId ?? null` collapsed `undefined` (field omitted
  // from request) into `null` (clear the field), which silently
  // erased the title + deal pin on every /calc/:id auto-save tick
  // because the auto-save sends only `{ payload }`.
  //
  // Semantic contract: explicit `null` in the body = "clear this
  // field". Field absent from the body = "leave unchanged".
  const updated = await updateRow(id, {
    hubspotDealId:
      body.hubspotDealId !== undefined ? body.hubspotDealId : existing.hubspotDealId,
    title: body.title !== undefined ? body.title : existing.title,
    payload: body.payload
  });
  if (!updated) throw new NotFoundError("Calculator config");
  return toPublic(updated);
}

/**
 * Cycle 2 — SOFT-delete a calc-config (full parity with documents'
 * `deleteDocument`). Serializes concurrent DELETEs for the same config
 * via a Postgres advisory transaction lock so a double-click can't fire
 * two HubSpot Note tear-downs (the second would 404 → misleading
 * `delete_failed`). The second caller gets a 409 to refresh their tab.
 */
export async function deleteCalculatorConfigById(
  id: string,
  actorUserId: string,
  reason: DeleteCalculatorConfigRequest["reason"],
  note: string | null
): Promise<CalculatorConfigPublic> {
  return db.transaction(async tx => {
    const claim = await tx.execute<{ acquired: boolean }>(sql`
      SELECT pg_try_advisory_xact_lock(hashtext('calc-delete:' || ${id}::text)) AS acquired
    `);
    if (!claim.rows[0]?.acquired) {
      throw new ConflictError(
        "CALC_DELETE_IN_PROGRESS",
        "Another delete for this calculator is already in progress. Try again in a moment."
      );
    }
    return deleteCalculatorConfigLocked(id, actorUserId, reason, note);
  });
}

/**
 * Internal worker invoked under the advisory lock. Mirrors documents'
 * `deleteDocumentLocked`: tears down the upstream HubSpot Note when the
 * row was synced, then soft-deletes locally. On a HubSpot failure the
 * row stays ALIVE in `delete_failed` so the operator can Retry.
 */
async function deleteCalculatorConfigLocked(
  id: string,
  actorUserId: string,
  reason: DeleteCalculatorConfigRequest["reason"],
  note: string | null
): Promise<CalculatorConfigPublic> {
  const calc = await findById(id);
  if (!calc) throw new NotFoundError("Calculator config");
  if (calc.deletedAt) {
    throw new ConflictError(
      "CALC_ALREADY_DELETED",
      "This calculator is already soft-deleted."
    );
  }

  // Tear down the HubSpot Note when one exists AND the last sync state
  // was 'synced' or 'delete_failed' (retry). Other states have no live
  // Note to clean up.
  const needsHubspot =
    calc.hubspotNoteId !== null &&
    (calc.hubspotSyncState === "synced" ||
      calc.hubspotSyncState === "delete_failed");

  if (needsHubspot && calc.hubspotNoteId) {
    if (!hubspot.isConfigured()) {
      throw new ValidationError(
        [{ path: ["hubspot"], message: "HubSpot integration is not configured." }],
        "HubSpot not configured — cannot tear down upstream Note"
      );
    }

    await updateCalculatorConfigHubspotSync(calc.id, {
      hubspotSyncState: "delete_pending",
      hubspotNoteId: calc.hubspotNoteId
    });

    try {
      await hubspot.deleteNote(calc.hubspotNoteId);
    } catch (err) {
      await updateCalculatorConfigHubspotSync(calc.id, {
        hubspotSyncState: "delete_failed",
        hubspotNoteId: calc.hubspotNoteId
      });
      await tryRecordEvent(
        () =>
          insertCalcConfigEvent({
            calculatorConfigId: calc.id,
            eventType: "sync_failed",
            actorUserId,
            meta: {
              stage: "delete",
              noteId: calc.hubspotNoteId,
              error: (err as Error).message
            }
          }),
        {
          label: "calc-config:delete",
          context: { calculatorConfigId: calc.id, noteId: calc.hubspotNoteId }
        }
      );
      logger.error(
        {
          calculatorConfigId: calc.id,
          noteId: calc.hubspotNoteId,
          err: (err as Error).message
        },
        "[calc-config:delete] HubSpot deleteNote failed — calc still alive, operator can Retry"
      );
      throw err instanceof HubspotUnreachableError
        ? err
        : new HubspotUnreachableError(
            `Failed to delete HubSpot Note (${calc.hubspotNoteId}): ${(err as Error).message}`,
            { noteId: calc.hubspotNoteId }
          );
    }
  }

  const updated = await softDeleteCalculatorConfig(calc.id, actorUserId, reason, note);
  if (!updated) {
    throw new InternalError(
      `[calc-config:delete] config ${calc.id} disappeared mid-delete`
    );
  }

  // History breadcrumb. Best-effort — never roll back the soft-delete.
  // `note` content is NOT echoed into event meta (it can be 8 KB of
  // operator commentary and the events endpoint is broadly readable);
  // only a `hasNote` boolean travels.
  await tryRecordEvent(
    () =>
      insertCalcConfigEvent({
        calculatorConfigId: updated.id,
        eventType: "deleted",
        actorUserId,
        meta: {
          reason,
          hasNote: note !== null && note.length > 0,
          hubspotNoteIdRemoved: calc.hubspotNoteId
        }
      }),
    { label: "calc-config:delete", context: { calculatorConfigId: updated.id } }
  );

  logger.info(
    {
      calculatorConfigId: updated.id,
      actorUserId,
      reason,
      hadHubspotNote: calc.hubspotNoteId !== null
    },
    "[calc-config:delete] calc soft-deleted"
  );

  return toPublic(updated);
}

/**
 * Cycle 2 — super_admin-only restore (parity with documents'
 * `restoreDocument`). Clears the soft-delete fields. Does NOT re-create
 * the HubSpot Note — operator clicks Sync if they want it back upstream.
 * Throws 404 when the config doesn't exist OR isn't currently deleted
 * (restore-on-alive is a no-op surfaced as 404 so a stale list's restore
 * button doesn't silently do nothing).
 */
export async function restoreCalculatorConfigById(
  id: string,
  actorUserId: string
): Promise<CalculatorConfigPublic> {
  const calc = await findById(id);
  if (!calc) throw new NotFoundError("Calculator config");
  if (!calc.deletedAt) throw new NotFoundError("Calculator config");

  const updated = await restoreCalculatorConfigRow(calc.id);
  if (!updated) {
    throw new InternalError(
      `[calc-config:restore] config ${calc.id} disappeared mid-restore`
    );
  }

  await tryRecordEvent(
    () =>
      insertCalcConfigEvent({
        calculatorConfigId: updated.id,
        eventType: "restored",
        actorUserId,
        meta: {}
      }),
    { label: "calc-config:restore", context: { calculatorConfigId: updated.id } }
  );

  logger.info(
    { calculatorConfigId: updated.id, actorUserId },
    "[calc-config:restore] calc restored"
  );

  return toPublic(updated);
}

export async function listCalculatorConfigsPage(
  args: ListCalculatorConfigsArgs
): Promise<CalculatorConfigListPage> {
  // Fetch limit+1 to know whether more rows exist beyond this page.
  // Sprint 6.8: uses buildSortedPage so the cursor carries the active
  // sort spec. Pre-6.8 callers used buildPage from build-page.ts.
  const rows = await listCalculatorConfigs({ ...args, limit: args.limit + 1 });
  return buildSortedPage(rows, args.limit, args.sort, toPublic, row => ({
    value: cursorValueForRow(row, args.sort.field),
    id: row.id
  }));
}
