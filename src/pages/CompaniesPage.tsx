/**
 * Companies listing — search + cursor pagination.
 *
 * UX choices:
 *   - The search input throttles via useDebouncedValue (300ms). The
 *     backend requires q.length >= 2, so anything shorter is treated
 *     as "no filter" (avoids 422 spam from one-character searches).
 *   - "Load more" button (rather than infinite scroll) keeps the UI
 *     deterministic for operators reviewing long lists.
 *   - Each row links to /companies/:id (the detail page lands in 2.8.E).
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { useCompanies } from "../hooks/useCompanies.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { formatDate } from "../shared/format.js";

export function CompaniesPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const {
    items,
    isLoading,
    isFetching,
    isError,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage
  } = useCompanies({ q: debouncedSearch });

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
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Segment</th>
              <th className="px-4 py-3 text-left">Lifecycle</th>
              <th className="px-4 py-3 text-left">HubSpot updated</th>
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
                  {formatDate(company.hubspotModifiedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {hasNextPage ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => fetchNextPage()}
            disabled={isFetchingNextPage}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
