/**
 * Cursor-pagination page builder.
 *
 * Reusable pattern: fetch `limit + 1` rows, slice to `limit`, derive
 * `nextCursor` from the LAST row of the page. Used by every listing
 * service (companies, deals, future: calculator_configs, documents,
 * listings).
 *
 * Usage:
 *   const rows = await repository.list({ limit: limit + 1, ... });
 *   const page = buildPage(rows, limit, toPublic, row => ({
 *     createdAt: row.createdAt.toISOString(),
 *     id: row.id
 *   }));
 *
 * Generic over the row type and the public DTO type so callers
 * project rows → DTO inside the helper rather than after.
 */

import { encodeCursor, type Cursor } from "./pagination";

export interface PageResult<TPublic> {
  items: TPublic[];
  nextCursor: string | null;
  limit: number;
}

export function buildPage<TRow, TPublic>(
  rows: TRow[],
  limit: number,
  toPublic: (row: TRow) => TPublic,
  toCursor: (row: TRow) => Cursor
): PageResult<TPublic> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  let nextCursor: string | null = null;
  if (hasMore) {
    const last = items[items.length - 1];
    nextCursor = encodeCursor(toCursor(last));
  }
  return {
    items: items.map(toPublic),
    nextCursor,
    limit
  };
}
