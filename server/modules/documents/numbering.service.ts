/**
 * Atomic BSG-XXXXXXX-YYYYYY number allocation.
 *
 * Format: `BSG-<seq:07d>-<companyKey:06d>` (e.g. BSG-7100001-874808),
 * matching phase_08_backend_plan.md §6. The 6-digit suffix is the
 * LAST 6 DIGITS of the company's `hubspot_company_id`, zero-padded
 * if the source has fewer digits. Includes company context in every
 * number so a casual eyeball of "BSG-7100037-874808" tells you it
 * belongs to the company whose HubSpot ID ends in 874808.
 *
 * The 7-digit `seq` part is monotonic across ALL documents (never
 * resets per-company); the suffix just adds context.
 *
 * Design: single `document_number_sequence` row, allocated via
 * `UPDATE ... RETURNING` so the read+increment is a single statement
 * that takes a row-level lock. Concurrent POSTs to /documents
 * serialise on that lock, each receives a distinct number.
 *
 * Why not pg `nextval()`? Two reasons (also documented in the schema):
 *   1. The starting value comes from `DOCUMENT_NUMBER_START` env var
 *      (default 7100001) — pg sequences need ALTER SEQUENCE privileges
 *      to reset.
 *   2. `nextval()` advances on any call, even if the surrounding TX
 *      rolls back — sequence gaps would accumulate on every failed
 *      INSERT. Our table-based approach participates in the TX, so
 *      rollback cleanly returns the number to the pool.
 */

import { sql } from "drizzle-orm";
import type { DbOrTx } from "../../db/client";
import { InternalError } from "../../shared/errors";

const SEQUENCE_ROW_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Peek at the NEXT number that would be allocated, WITHOUT advancing.
 * Used by the wizard preview UI on Step 1 (HeaderMetaStep).
 *
 * Pass `hubspotCompanyId` to get the full BSG-<seq>-<suffix> preview.
 * If omitted, returns `BSG-<seq>-XXXXXX` so the UI can show a partial
 * preview before the operator picks a company.
 *
 * Race note: two concurrent peeks return the same seq; that's
 * EXPECTED — peek is a hint, not a reservation. The Save click will
 * call allocateNextNumber() inside its TX which assigns the real
 * (and possibly different) number.
 */
export async function peekNextNumber(
  tx: DbOrTx,
  hubspotCompanyId?: string
): Promise<string> {
  const result = await tx.execute<{ next_value: number }>(sql`
    SELECT next_value FROM document_number_sequence WHERE id = ${SEQUENCE_ROW_ID}
  `);
  const row = result.rows[0];
  if (!row) {
    throw new InternalError(
      "document_number_sequence seed row missing — migrations not applied?"
    );
  }
  return formatNumber(row.next_value, hubspotCompanyId);
}

/**
 * Allocate the NEXT BSG-<seq>-<suffix> number, advancing the sequence.
 *
 * MUST be called inside a transaction — the row-level lock acquired
 * by `UPDATE ... RETURNING` is held until the surrounding TX
 * commits/rolls back, so other concurrent allocators wait their turn.
 *
 * `hubspotCompanyId` is required — the caller (documents.service)
 * looks it up from `companies.hubspot_company_id` after validating
 * the request's `companyId`. Without it the format can't be built.
 *
 * If the document INSERT fails after this call, the TX rolls back
 * and the increment is reverted — no number is leaked.
 */
export async function allocateNextNumber(
  tx: DbOrTx,
  hubspotCompanyId: string
): Promise<string> {
  const result = await tx.execute<{ next_value: number }>(sql`
    UPDATE document_number_sequence
    SET next_value = next_value + 1
    WHERE id = ${SEQUENCE_ROW_ID}
    RETURNING next_value - 1 AS next_value
  `);
  const row = result.rows[0];
  if (!row) {
    throw new InternalError(
      "document_number_sequence seed row missing — migrations not applied?"
    );
  }
  return formatNumber(row.next_value, hubspotCompanyId);
}

/**
 * Format the integer counter as `BSG-<seq:07d>-<suffix:06d>`.
 *
 * If `hubspotCompanyId` is missing/empty, returns `BSG-<seq>-XXXXXX`
 * — the wizard's pre-company-pick state renders that as a placeholder
 * so the operator sees the seq part live-update before committing.
 *
 * The suffix is the LAST 6 DIGITS of `hubspotCompanyId`. HubSpot ids
 * are numeric strings (e.g. "426487875793"), so we take the last 6
 * chars verbatim. If for some reason the id is shorter, left-pad
 * with zeros.
 *
 * Exported separately so tests can verify the format without hitting
 * the DB.
 */
export function formatNumber(
  value: number,
  hubspotCompanyId?: string
): string {
  if (!Number.isInteger(value) || value < 1) {
    throw new InternalError(`Cannot format invalid sequence value: ${value}`);
  }
  const seq = value.toString().padStart(7, "0");
  const suffix = formatCompanySuffix(hubspotCompanyId);
  return `BSG-${seq}-${suffix}`;
}

function formatCompanySuffix(hubspotCompanyId: string | undefined): string {
  if (!hubspotCompanyId || hubspotCompanyId.length === 0) {
    // Pre-company-pick placeholder — wizard renders this verbatim so
    // the operator visually knows what changes once they pick a company.
    return "XXXXXX";
  }
  // Take the LAST 6 chars; pad with leading zeros if the source has
  // fewer. HubSpot ids in BSG's data are always 12 digits, so the
  // padding branch is defensive only.
  const tail = hubspotCompanyId.slice(-6);
  return tail.padStart(6, "0");
}
