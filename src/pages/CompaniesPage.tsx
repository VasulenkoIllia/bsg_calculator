/**
 * Companies listing — search + cursor pagination + per-column sort.
 *
 * Sprint 7.2: added clickable sortable column headers via
 * `SortableTh` + `useSortState`, matching the UX shipped earlier
 * for /documents and /calculators. Default sort `createdAt:desc`
 * preserves pre-7.2 ordering.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import type { CompanySortField } from "../api/companies.js";
import { LoadMoreButton } from "../components/LoadMoreButton.js";
import { SortableTh } from "../components/SortableTh.js";
import { useCompanies } from "../hooks/useCompanies.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { useSortState } from "../hooks/useSortState.js";
import { SEARCH_DEBOUNCE_MS } from "../shared/constants.js";
import { formatDateTime } from "../shared/format.js";

export function CompaniesPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  // Sprint 7.2: shared sort-state hook. Default createdAt:desc
  // matches the backend default.
  const { sortField, sortDir, sortSpec, handleSortChange } =
    useSortState<CompanySortField>("createdAt", "desc");

  const {
    items,
    isLoading,
    isFetching,
    isError,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage
  } = useCompanies({ q: debouncedSearch, sort: sortSpec });

  // Background re-fetch indicator (e.g. when the user toggles back
  // to the tab and the data has gone stale). Distinct from the
  // initial-load row, which uses `isLoading`.
  const isBackgroundRefetching = isFetching && !isLoading;

  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Companies</h1>
          <p className="text-sm text-slate-500">
            HubSpot-synced direct clients. Click a row to open deals and details.
          </p>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Search{isBackgroundRefetching ? <span className="ml-2 font-normal lowercase text-slate-400">· refreshing…</span> : null}
          </span>
          <input
            type="search"
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Name contains…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-72"
          />
        </label>
      </header>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <SortableTh
                field="name"
                activeField={sortField}
                activeDirection={sortDir}
                onSortChange={handleSortChange}
              >
                Name
              </SortableTh>
              <SortableTh
                field="segmentType"
                activeField={sortField}
                activeDirection={sortDir}
                onSortChange={handleSortChange}
              >
                Segment
              </SortableTh>
              <SortableTh
                field="lifecycleStage"
                activeField={sortField}
                activeDirection={sortDir}
                onSortChange={handleSortChange}
              >
                Lifecycle
              </SortableTh>
              <SortableTh
                field="hubspotModifiedAt"
                activeField={sortField}
                activeDirection={sortDir}
                onSortChange={handleSortChange}
              >
                HubSpot updated
              </SortableTh>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                  Loading companies…
                </td>
              </tr>
            ) : null}

            {isError ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-red-600">
                  Failed to load companies
                  {error instanceof ApiError ? `: ${error.message}` : "."}
                </td>
              </tr>
            ) : null}

            {!isLoading && !isError && items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                  {debouncedSearch.trim().length >= 2
                    ? `No companies match “${debouncedSearch.trim()}”.`
                    : "No companies yet."}
                </td>
              </tr>
            ) : null}

            {items.map(company => (
              <tr key={company.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <Link
                    to={`/companies/${company.id}`}
                    className="font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                  >
                    {company.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{company.segmentType ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700">{company.lifecycleStage ?? "—"}</td>
                <td className="px-4 py-3 text-slate-500">
                  {formatDateTime(company.hubspotModifiedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LoadMoreButton
        hasNextPage={hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
      />
    </section>
  );
}
