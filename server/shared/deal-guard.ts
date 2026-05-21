/**
 * Sprint 9.L D1 — cross-company-deal guard.
 *
 * Shared by `documents.service.ts` (create) and
 * `calculator-configs.service.ts` (create + update). Was previously
 * duplicated in both modules; the duplicate copies were trivial to
 * keep in sync but they came with the same boilerplate `if (!ok)
 * throw new ValidationError(...)` block in every caller.
 *
 * Centralising the guard:
 *   - guarantees the error MESSAGE + PATH shape stays identical
 *     across endpoints (the FE keys off `details[0].path` to render
 *     the field-level error);
 *   - keeps the `dealBelongsToCompany` repo function as the single
 *     query implementation (no second copy to drift);
 *   - lets future endpoints (e.g. wizard meta validation) reuse the
 *     same guard without reimporting from a peer module.
 */

import { dealBelongsToCompany } from "../modules/calculator-configs/calculator-configs.repository";
import { ValidationError } from "./errors";

/**
 * Throws `ValidationError({ path: ["hubspotDealId"] })` when the deal
 * referenced does not belong to the given company. No-op when the
 * deal id is null/undefined (deals are optional on both documents
 * and calc-configs — a draft can exist company-only).
 *
 * `hubspotDealId` is the HubSpot natural key (string).
 * `companyId`   is the UUID PK of the `companies` table.
 */
export async function ensureDealBelongsToCompany(
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
