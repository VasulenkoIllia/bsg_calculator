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
 * Used by SaveCalculatorModal (Sprint 3.B), CompanyFilter on
 * DocumentsListPage (Sprint 4.D), and WizardBackendBar (Sprint 4.E).
 *
 * Sprint 6.6 UX note: callers now show the dropdown on focus (no
 * `>= 2 chars` gate), so this hook is called with an empty query
 * on first render. The backend listing already accepts an empty
 * `q` as "no filter" and returns the first `limit=10` companies —
 * so the operator can browse without typing. Typing then narrows
 * the list.
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

export function useCompanySearch(rawQuery: string): UseCompanySearchResult {
  const debounced = useDebouncedValue(rawQuery, SEARCH_DEBOUNCE_MS);
  const trimmed = debounced.trim();
  // Limit 10 — pickers don't need more results visible at once;
  // the operator narrows the search if their company isn't there.
  const { items, isLoading, isError } = useCompanies({ q: trimmed, limit: 10 });

  return {
    items,
    isLoading,
    isError,
    effectiveQuery: trimmed
  };
}
