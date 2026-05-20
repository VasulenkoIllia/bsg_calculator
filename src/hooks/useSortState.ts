/**
 * Sprint 7.2: shared sort-state hook for listing pages.
 *
 * Pre-7.2 every listing page (CompaniesPage, DocumentsListPage,
 * CalculatorsListPage, the three CompanyDetailPage tabs) repeated
 * the same boilerplate:
 *
 *   const [sortField, setSortField] = useState<Field>("createdAt");
 *   const [sortDir, setSortDir] = useState<SortDirection>("desc");
 *   const handleSortChange = (field: Field, dir: SortDirection) => {
 *     setSortField(field);
 *     setSortDir(dir);
 *   };
 *   ...use `${sortField}:${sortDir}` as the API param...
 *
 * That's 7 lines of identical noise per page. Extracting it does
 * three things at once:
 *   1. Removes the duplication (single import + 1 line per page).
 *   2. Makes the encoded "field:dir" string the canonical thing
 *      the page passes around — no risk of accidentally sending
 *      the two halves to the wrong consumer.
 *   3. Centralises the SortableTh contract so a future change
 *      (e.g. "clicking the active column toggles between asc /
 *      desc / off") lands in one place.
 */

import { useCallback, useState } from "react";
import { type SortDirection } from "../components/SortableTh.js";

export interface UseSortStateResult<TField extends string> {
  /** Currently-active sort column. Defaults to the initialField. */
  sortField: TField;
  /** Currently-active direction. Defaults to the initialDirection. */
  sortDir: SortDirection;
  /**
   * Encoded `field:dir` string. Pass this directly into the API
   * hook's `sort` option — the backend expects this exact shape.
   * Typed via the union literal so the consumer can re-narrow it
   * back to a `DocumentSortSpec` / `CompanySortSpec` / etc. if
   * a stricter API param shape requires.
   */
  sortSpec: `${TField}:${SortDirection}`;
  /**
   * Wire this directly to `<SortableTh onSortChange={...}>`. Stable
   * via useCallback so passing it down doesn't break memoised
   * thead rows.
   */
  handleSortChange: (field: TField, dir: SortDirection) => void;
}

export function useSortState<TField extends string>(
  initialField: TField,
  initialDirection: SortDirection = "desc"
): UseSortStateResult<TField> {
  const [sortField, setSortField] = useState<TField>(initialField);
  const [sortDir, setSortDir] = useState<SortDirection>(initialDirection);

  const handleSortChange = useCallback(
    (field: TField, dir: SortDirection) => {
      setSortField(field);
      setSortDir(dir);
    },
    []
  );

  return {
    sortField,
    sortDir,
    sortSpec: `${sortField}:${sortDir}` as `${TField}:${SortDirection}`,
    handleSortChange
  };
}
