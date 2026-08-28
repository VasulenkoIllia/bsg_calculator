/**
 * Typeahead hook for picking a company in modals / pickers.
 *
 * Thin wrapper around `useCompanies` that:
 *   - debounces the input via useDebouncedValue (300ms, shared
 *     SEARCH_DEBOUNCE_MS constant)
 *   - returns just the first page (typeahead pickers should "Load
 *     more" via Search refinement, not pagination, so we don't expose
 *     fetchNextPage here)
 *
 * Sprint 6.6 consolidated the three original call sites (modals +
 * filters) into a single shared `CompanyTypeahead` component —
 * this hook is now used ONLY from there. The hook stays as a named
 * abstraction because it exports `effectiveQuery` (the trimmed
 * debounced value), which the consuming component uses for the
 * "No matches for X" empty-state copy.
 *
 * Behaviour: callers show the dropdown on focus (no `>= 2 chars`
 * gate), so this hook is called with an empty query on first render.
 * The backend listing accepts an empty `q` as "no filter" and
 * returns the first `limit=10` companies — so the operator can
 * browse without typing. Typing then narrows the list.
 */

import { useCompanies } from "./useCompanies.js";
import { useDebouncedValue } from "./useDebouncedValue.js";
import { SEARCH_DEBOUNCE_MS } from "../shared/constants.js";
import type { PublicCompany } from "../api/types.js";

export interface UseCompanySearchResult {
  items: PublicCompany[];
  isLoading: boolean;
  isError: boolean;
  /**
   * The trimmed, debounced query that backend actually saw. Useful for
   * "Search returned 0 results for X" empty-state copy.
   */
  effectiveQuery: string;
}

export function useCompanySearch(
  rawQuery: string,
  companyType?: "direct_client" | "referring_partner"
): UseCompanySearchResult {
  const debounced = useDebouncedValue(rawQuery, SEARCH_DEBOUNCE_MS);
  const trimmed = debounced.trim();
  // Limit 10 — pickers don't need more results visible at once;
  // the operator narrows the search if their company isn't there.
  // Browse (empty query) is sorted by NAME, not by creation date. The
  // first monday backfill inserts ~42 agents with created_at = now, so a
  // createdAt:desc default would fill the operator's first ten browse
  // results with rows they must never pick, and push their actual
  // clients out of sight until they start typing.
  const { items, isLoading, isError } = useCompanies({
    q: trimmed,
    limit: 10,
    companyType,
    sort: "name:asc"
  });

  return {
    items,
    isLoading,
    isError,
    effectiveQuery: trimmed
  };
}
