/**
 * Drizzle helpers — defensive wrappers around common patterns.
 *
 * `INSERT … RETURNING` types as `T[]` even when the INSERT logically
 * returns exactly one row; destructuring without a guard would
 * silently return `undefined` if a driver bug / cascade trigger
 * suppressed the row. `expectSingle` makes that crash loud + early.
 */

import { InternalError } from "./errors";

/**
 * Assert that a row-returning query produced exactly one row and
 * return it. Anything else (zero rows, multiple rows) is an
 * internal-consistency bug — surface it as InternalError so the
 * error-handler logs the stack and returns a generic 500.
 */
export function expectSingle<T>(rows: T[], context: string): T {
  if (rows.length === 0) {
    throw new InternalError(`expectSingle(${context}): no row returned`);
  }
  if (rows.length > 1) {
    throw new InternalError(`expectSingle(${context}): ${rows.length} rows returned, expected 1`);
  }
  return rows[0];
}
