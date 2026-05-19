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

import { parseDtoOrInternalError } from "../../shared/dto-parse";
import { buildSortedPage, type PageResult } from "../../shared/sorted-pagination";
import { NotFoundError, ValidationError } from "../../shared/errors";
import type { CalculatorConfig } from "../../db/schema";
import type { CalculatorConfigWithCompanyName } from "./calculator-configs.repository";
import {
  cursorValueForRow,
  dealBelongsToCompany,
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
      updatedAt: row.updatedAt.toISOString()
    },
    "calculator-configs.toPublic"
  );
}

export type CalculatorConfigListPage = PageResult<CalculatorConfigPublic>;

/**
 * Cross-company-deal guard. Throws ValidationError if the given deal
 * (by HubSpot id) does not belong to the given company. Used by both
 * create and update.
 *
 * `dealId` is the HubSpot natural key; `companyId` is the UUID PK.
 */
async function ensureDealBelongsToCompany(
  hubspotDealId: string | null | undefined,
  companyId: string
): Promise<void> {
  if (!hubspotDealId) return;
  const ok = await dealBelongsToCompany(hubspotDealId, companyId);
  if (!ok) {
    throw new ValidationError(
      [
        {
          path: ["hubspotDealId"],
          message: "Deal does not belong to the specified company"
        }
      ],
      "Cross-company deal reference"
    );
  }
}

export async function createCalculatorConfig(
  body: CreateCalculatorConfigRequest,
  actorUserId: string
): Promise<CalculatorConfigPublic> {
  await ensureDealBelongsToCompany(body.hubspotDealId, body.companyId);

  const row = await insertCalculatorConfig({
    companyId: body.companyId,
    hubspotDealId: body.hubspotDealId ?? null,
    title: body.title ?? null,
    payload: body.payload,
    createdByUserId: actorUserId
  });
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
