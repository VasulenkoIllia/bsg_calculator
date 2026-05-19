/**
 * Documents listing — /documents.
 *
 * Mirrors CompaniesPage in shape: search box, table, Load more.
 * Substring search on the `number` column (e.g. typing "7100024"
 * matches "BSG-7100024-..."). Company filter via typeahead picker.
 *
 * Sprint 6.8: added Company column (link to /companies/:id) plus
 * clickable column headers for asc↔desc sort on every column.
 * Backend pairing: `?sort=field:dir` controls the ORDER BY; cursor
 * carries the sort spec so a mid-pagination switch is rejected.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { CompanyTypeahead } from "../components/CompanyTypeahead.js";
import { LoadMoreButton } from "../components/LoadMoreButton.js";
import { SortableTh, type SortDirection } from "../components/SortableTh.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { useDocuments } from "../hooks/useDocuments.js";
import { SEARCH_DEBOUNCE_MS } from "../shared/constants.js";
import { formatDate, formatScopeLabel } from "../shared/format.js";
import type { DocumentSortField } from "../api/documents.js";
import type { PublicCompany } from "../api/types.js";

/**
 * Inline company filter — Sprint 6.6 uses the shared CompanyTypeahead
 * (dropdown-on-focus). Operator clicks the field, sees the company
 * list, picks one → chip. Click "Change" inside the chip to swap
 * to a different company; the parent passes `null` back to clear.
 */
function CompanyFilter({
  selected,
  onSelectedChange
}: {
  selected: PublicCompany | null;
  onSelectedChange: (company: PublicCompany | null) => void;
}) {
  return (
    <CompanyTypeahead
      selected={selected}
      onSelectedChange={onSelectedChange}
      label="Filter by company"
      placeholder="Click to browse, or type to filter…"
      className="w-full sm:w-72"
    />
  );
}

export function DocumentsListPage() {
  const [search, setSearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<PublicCompany | null>(null);
  // Sprint 6.8: per-column sort state — default mirrors the backend
  // default (`createdAt:desc`), so the initial render matches the
  // pre-6.8 ordering exactly. Flipping sort triggers a fresh
  // TanStack-Query page chain via the queryKey.
  const [sortField, setSortField] = useState<DocumentSortField>("createdAt");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);
  const trimmed = debouncedSearch.trim();

  const handleSortChange = (field: DocumentSortField, dir: SortDirection) => {
    setSortField(field);
    setSortDir(dir);
  };

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
    companyId: selectedCompany?.id,
    sort: `${sortField}:${sortDir}`
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
          <thead className="bg-slate-50">
            <tr>
              <SortableTh
                field="number"
                activeField={sortField}
                activeDirection={sortDir}
                onSortChange={handleSortChange}
              >
                Number
              </SortableTh>
              <SortableTh
                field="companyName"
                activeField={sortField}
                activeDirection={sortDir}
                onSortChange={handleSortChange}
              >
                Company
              </SortableTh>
              <SortableTh
                field="scope"
                activeField={sortField}
                activeDirection={sortDir}
                onSortChange={handleSortChange}
              >
                Scope
              </SortableTh>
              <SortableTh
                field="hubspotSyncState"
                activeField={sortField}
                activeDirection={sortDir}
                onSortChange={handleSortChange}
              >
                HubSpot sync
              </SortableTh>
              <SortableTh
                field="createdAt"
                activeField={sortField}
                activeDirection={sortDir}
                onSortChange={handleSortChange}
              >
                Created
              </SortableTh>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                  Loading documents…
                </td>
              </tr>
            ) : null}

            {isError ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-red-600">
                  Failed to load documents
                  {error instanceof ApiError ? `: ${error.message}` : "."}
                </td>
              </tr>
            ) : null}

            {!isLoading && !isError && items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
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
                <td className="px-4 py-3 text-slate-700">
                  {/*
                    Sprint 6.8: backend list endpoint JOINs companies
                    and returns `companyName`. Link to /companies/:id
                    mirrors the Saved-calculators page (Sprint 6.7).
                    Sprint 6.9 S12: PublicDocumentListItem makes
                    companyName REQUIRED (the INNER JOIN + non-null
                    FK guarantees it), so no fallback needed.
                  */}
                  <Link
                    to={`/companies/${doc.companyId}`}
                    className="font-medium text-blue-700 hover:text-blue-900 hover:underline"
                  >
                    {doc.companyName} →
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">{formatScopeLabel(doc.scope)}</td>
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
