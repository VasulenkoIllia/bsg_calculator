/**
 * Documents listing — /documents.
 *
 * Mirrors CompaniesPage in shape: search box, table, Load more.
 * Substring search on the `number` column (e.g. typing "7100024"
 * matches "BSG-7100024-..."). Company filter via typeahead picker.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { LoadMoreButton } from "../components/LoadMoreButton.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { useCompanySearch } from "../hooks/useCompanySearch.js";
import { useDocuments } from "../hooks/useDocuments.js";
import { SEARCH_DEBOUNCE_MS } from "../shared/constants.js";
import { formatDate } from "../shared/format.js";
import type { PublicCompany } from "../api/types.js";

function scopeLabel(scope: string): string {
  switch (scope) {
    case "offer":
      return "Offer";
    case "agreement":
      return "Agreement";
    case "offer_and_agreement":
      return "Offer + Agreement";
    default:
      return scope;
  }
}

/**
 * Inline company typeahead used as a filter chip. Renders a "× clear"
 * button when a company is picked so the operator can return to the
 * unfiltered view in one click.
 */
function CompanyFilter({
  selected,
  onSelectedChange
}: {
  selected: PublicCompany | null;
  onSelectedChange: (company: PublicCompany | null) => void;
}) {
  const [query, setQuery] = useState("");
  const companySearch = useCompanySearch(query);

  if (selected) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
          Filter
        </span>
        <div className="flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm">
          <span className="font-semibold text-blue-900">{selected.name}</span>
          <button
            type="button"
            onClick={() => onSelectedChange(null)}
            className="text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline"
            aria-label="Clear company filter"
          >
            × clear
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full sm:w-72">
      <span className="block text-xs font-semibold uppercase tracking-wide text-slate-600">
        Filter by company
      </span>
      <input
        type="search"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Type at least 2 letters…"
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
      />
      {companySearch.effectiveQuery.length >= 2 ? (
        <ul
          role="listbox"
          className="absolute z-10 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm shadow-sm"
        >
          {companySearch.isLoading ? (
            <li className="px-3 py-2 text-slate-500">Searching…</li>
          ) : companySearch.items.length === 0 ? (
            <li className="px-3 py-2 text-slate-500">
              No matches for "{companySearch.effectiveQuery}"
            </li>
          ) : (
            companySearch.items.map(c => (
              <li
                key={c.id}
                role="option"
                aria-selected="false"
                className="cursor-pointer px-3 py-2 hover:bg-blue-50"
                onClick={() => {
                  onSelectedChange(c);
                  setQuery("");
                }}
              >
                {c.name}
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

export function DocumentsListPage() {
  const [search, setSearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<PublicCompany | null>(null);
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const trimmed = debouncedSearch.trim();

  const {
    items,
    isLoading,
    isFetching,
    isError,
    error,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage
  } = useDocuments({
    q: trimmed.length > 0 ? trimmed : undefined,
    companyId: selectedCompany?.id
  });

  const isBackgroundRefetching = isFetching && !isLoading;

  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Documents</h1>
          <p className="text-sm text-slate-500">
            Frozen offers + agreements saved from the wizard. Click a row to
            view, download PDF, or use as a template.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <CompanyFilter
            selected={selectedCompany}
            onSelectedChange={setSelectedCompany}
          />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Search by number
              {isBackgroundRefetching ? (
                <span className="ml-2 font-normal lowercase text-slate-400">
                  · refreshing…
                </span>
              ) : null}
            </span>
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="e.g. 7100024 or BSG-71"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-72"
            />
          </label>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left">Number</th>
              <th className="px-4 py-3 text-left">Scope</th>
              <th className="px-4 py-3 text-left">HubSpot sync</th>
              <th className="px-4 py-3 text-left">Created</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                  Loading documents…
                </td>
              </tr>
            ) : null}

            {isError ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-red-600">
                  Failed to load documents
                  {error instanceof ApiError ? `: ${error.message}` : "."}
                </td>
              </tr>
            ) : null}

            {!isLoading && !isError && items.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
                  {trimmed.length > 0 || selectedCompany
                    ? "No documents match the current filters."
                    : "No documents yet. Save one from the wizard to populate this list."}
                </td>
              </tr>
            ) : null}

            {items.map(doc => (
              <tr key={doc.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-mono font-semibold text-blue-700">
                  <Link
                    to={`/documents/${doc.number}`}
                    className="hover:text-blue-900 hover:underline"
                  >
                    {doc.number}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{scopeLabel(doc.scope)}</td>
                <td className="px-4 py-3 text-slate-500">
                  {doc.hubspotSyncState === "not_synced" ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      Not synced
                    </span>
                  ) : doc.hubspotSyncState === "synced" ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      Synced
                    </span>
                  ) : (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Failed
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">{formatDate(doc.createdAt)}</td>
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
