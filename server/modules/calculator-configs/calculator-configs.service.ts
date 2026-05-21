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

import { db } from "../../db/client";
import { env } from "../../config/env";
import { logger } from "../../middleware/logger";
import { parseDtoOrInternalError } from "../../shared/dto-parse";
import { buildSortedPage, type PageResult } from "../../shared/sorted-pagination";
import { NotFoundError } from "../../shared/errors";
import { ensureDealBelongsToCompany } from "../../shared/deal-guard";
import { insertCalcConfigEvent } from "../events/events.repository";
import type { CalculatorConfig } from "../../db/schema";
import type { CalculatorConfigWithCompanyName } from "./calculator-configs.repository";
import {
  cursorValueForRow,
  deleteCalculatorConfig as deleteRow,
  findById,
  insertCalculatorConfig,
  listCalculatorConfigs,
  updateCalculatorConfig as updateRow,
  type ListCalculatorConfigsArgs
} from "./calculator-configs.repository";
import {
  calculatorConfigPublicSchema,
  type CalculatorConfigPublic,
  type CreateCalculatorConfigRequest,
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
      hubspotSyncState: row.hubspotSyncState
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

export async function deleteCalculatorConfigById(id: string): Promise<void> {
  const removed = await deleteRow(id);
  if (!removed) throw new NotFoundError("Calculator config");
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
