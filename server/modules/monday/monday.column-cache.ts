/**
 * Shared, briefly-cached column resolver.
 *
 * Extracted from the webhook processor so the TTL refresh can reuse it:
 * resolving three boards' columns on every stale row read would turn a
 * cheap background refresh into three extra API calls per page view.
 *
 * The cache is deliberately SHORT. A permanent one would mean a column
 * recreated in monday keeps resolving to the OLD id for as long as the
 * process lives, and the mapper would quietly write NULLs in the
 * meantime. Four mapped columns were deleted and recreated inside a
 * single week in August 2026, so this is not hypothetical.
 */

import {
  AGENT_COLUMNS,
  COMPANY_COLUMNS,
  DEAL_COLUMNS,
  resolveBoardColumns,
  type ResolvedColumns
} from "./monday.columns";

const COLUMN_CACHE_TTL_MS = 5 * 60 * 1000;
const columnCache = new Map<string, { at: number; cols: ResolvedColumns }>();

export async function columnsFor(
  boardId: string,
  objectType: "company" | "agent" | "deal"
): Promise<ResolvedColumns> {
  const cached = columnCache.get(boardId);
  if (cached && Date.now() - cached.at < COLUMN_CACHE_TTL_MS) return cached.cols;
  const specs =
    objectType === "deal" ? DEAL_COLUMNS : objectType === "agent" ? AGENT_COLUMNS : COMPANY_COLUMNS;
  const resolved = await resolveBoardColumns(boardId, specs);
  columnCache.set(boardId, { at: Date.now(), cols: resolved });
  return resolved;
}

/** Test seam: drop the cache so a test can change a board's columns. */
export function clearColumnCache(): void {
  columnCache.clear();
}
