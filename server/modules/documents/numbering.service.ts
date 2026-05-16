/**
 * Atomic BSG-XXXXX number allocation.
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
 *
 * Format: BSG-<7-digit-zero-padded>. Sprint 4 starts at 7100001 →
 * BSG-7100001. Padding is fixed at 7 digits — when we hit 9999999
 * (~3M years of BSG operations) the format MAY widen with no
 * back-compat concerns.
 */

import { sql } from "drizzle-orm";
import type { DbOrTx } from "../../db/client";
import { InternalError } from "../../shared/errors";

const SEQUENCE_ROW_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Peek at the NEXT number that would be allocated, WITHOUT advancing.
 * Used by the wizard preview "Document Number: BSG-7100024 (assigned
 * when saved)" UI. The actual allocation happens inside the POST TX
 * via `allocateNextNumber()`.
 *
 * Race note: two concurrent peeks return the same number; that's
 * EXPECTED — peek is a hint, not a reservation. The Save click will
 * call allocateNextNumber() inside its TX which assigns the real
 * (and possibly different) number.
 */
export async function peekNextNumber(tx: DbOrTx): Promise<string> {
  const result = await tx.execute<{ next_value: number }>(sql`
    SELECT next_value FROM document_number_sequence WHERE id = ${SEQUENCE_ROW_ID}
  `);
  const row = result.rows[0];
  if (!row) {
    throw new InternalError(
      "document_number_sequence seed row missing — migrations not applied?"
    );
  }
  return formatNumber(row.next_value);
}

/**
 * Allocate the NEXT BSG-XXXXX number, advancing the sequence.
 *
 * MUST be called inside a transaction — the row-level lock acquired
 * by `UPDATE ... RETURNING` is held until the surrounding TX
 * commits/rolls back, so other concurrent allocators wait their turn.
 *
 * If the document INSERT fails after this call, the TX rolls back
 * and the increment is reverted — no number is leaked.
 */
export async function allocateNextNumber(tx: DbOrTx): Promise<string> {
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
  return formatNumber(row.next_value);
}

/**
 * Format the integer counter as BSG-<7-digit-zero-padded>.
 *
 * Exported separately so tests can verify the format without hitting
 * the DB.
 */
export function formatNumber(value: number): string {
  if (!Number.isInteger(value) || value < 1) {
    throw new InternalError(`Cannot format invalid sequence value: ${value}`);
  }
  return `BSG-${value.toString().padStart(7, "0")}`;
}
