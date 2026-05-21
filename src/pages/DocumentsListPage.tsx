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
 *
 * Sprint 9.N — three new columns + filters per operator brief:
 *   - **Status** column: badge "Active" / "Deleted (reason)". Soft-
 *     deleted documents are NOW visible in the main listing (the
 *     Sprint 9.M B5 hide policy was reversed — operator wants to
 *     see retracted docs in-place with a clear marker).
 *   - **Last action** column: most-recent event from the audit log
 *     (Synced · Admin · 2h ago / Deleted · Admin · 5m ago).
 *   - **Scope filter** dropdown: All / Offer / Agreement / Both.
 *   - **Status filter** dropdown: All / Active only / Deleted only.
 *
 * The previous AdminDeletedDocumentsPage was removed — the Status
 * filter on this page covers the same use case for super_admin and
 * any operator can now see deletion context.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { CompanyTypeahead } from "../components/CompanyTypeahead.js";
import { LastActionCell } from "../components/LastActionCell.js";
import { LoadMoreButton } from "../components/LoadMoreButton.js";
import { SortableTh } from "../components/SortableTh.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { useDocuments } from "../hooks/useDocuments.js";
import { useSortState } from "../hooks/useSortState.js";
import { SEARCH_DEBOUNCE_MS } from "../shared/constants.js";
import { formatDateTime, formatScopeLabel } from "../shared/format.js";
import type {
  DocumentScope,
  DocumentSortField
} from "../api/documents.js";
import type {
  DocumentDeletionReason,
  PublicCompany,
  PublicDocumentListItem
} from "../api/types.js";

/**
 * Sprint 9.N — humanise the deletion reason enum for the Status
 * badge. Mirrors the labels in DeleteDocumentModal / DocumentViewPage
 * — kept inline because the helper is 7 lines and the duplication
 * keeps each page self-contained.
 */
function humanReason(reason: DocumentDeletionReason): string {
  switch (reason) {
    case "client_request":
      return "Client request";
    case "created_in_error":
      return "Created in error";
    case "replaced_by_new_version":
      return "Replaced by new";
    case "duplicate":
      return "Duplicate";
    case "other":
      return "Other";
    default: {
      const _exhaustive: never = reason;
      return String(_exhaustive);
    }
  }
}

/**
 * Sprint 9.N — Status column renderer. Two states today: Active
 * (the row is alive) and Deleted (with the reason inline). When
 * Stage 6 adds delete_pending / delete_failed transition states we
 * can extend this without touching the row JSX.
 */
function StatusCell({ doc }: { doc: PublicDocumentListItem }) {
  if (doc.deletedAt) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="inline-flex w-fit items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
          Deleted
        </span>
        {doc.deletionReason ? (
          <span className="text-xs text-slate-500">
            {humanReason(doc.deletionReason)}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <span className="inline-flex w-fit items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-green-700">
      Active
    </span>
  );
}

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

type StatusFilter = "all" | "active" | "deleted";

export function DocumentsListPage() {
  const [search, setSearch] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<PublicCompany | null>(null);
  // Sprint 9.N — new product filters.
  const [scopeFilter, setScopeFilter] = useState<DocumentScope | "all">("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // Sprint 7.2: shared sort-state hook (was 7 lines of repetitive
  // useState pairs in 6.8). Default createdAt:desc mirrors backend
  // default. Flipping sort triggers a fresh TanStack-Query page
  // chain via the queryKey on the hook side.
  const { sortField, sortDir, sortSpec, handleSortChange } =
    useSortState<DocumentSortField>("createdAt", "desc");
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
    companyId: selectedCompany?.id,
    scope: scopeFilter === "all" ? undefined : scopeFilter,
    includeDeleted:
      statusFilter === "active"
        ? "false"
        : statusFilter === "deleted"
          ? "only"
          : undefined, // "all" → backend default (include_deleted)
    sort: sortSpec
  });

  const isBackgroundRefetching = isFetching && !isLoading;

  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Documents</h1>
          <p className="text-sm text-slate-500">
            Frozen offers + agreements. Click a row to view, download PDF, or
            use as a template. Deleted rows stay in the list with a Deleted
            badge — the HubSpot Note is removed but the local audit trail
            survives.
          </p>
        </div>
      </header>

      {/* Sprint 9.N — filter strip: company + search + scope + status. */}
      <div className="flex flex-col flex-wrap gap-3 sm:flex-row sm:items-end">
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
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-56"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Scope
          </span>
          <select
            value={scopeFilter}
            onChange={e => setScopeFilter(e.target.value as DocumentScope | "all")}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-48"
          >
            <option value="all">All scopes</option>
            <option value="offer">Offer</option>
            <option value="agreement">Agreement</option>
            <option value="offer_and_agreement">Offer + Agreement</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Status
          </span>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-40"
          >
            <option value="all">All</option>
            <option value="active">Active only</option>
            <option value="deleted">Deleted only</option>
          </select>
        </label>
      </div>

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
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Status
              </th>
              <SortableTh
                field="hubspotSyncState"
                activeField={sortField}
                activeDirection={sortDir}
                onSortChange={handleSortChange}
              >
                HubSpot sync
              </SortableTh>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Last action
              </th>
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
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                  Loading documents…
                </td>
              </tr>
            ) : null}

            {isError ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-red-600">
                  Failed to load documents
                  {error instanceof ApiError ? `: ${error.message}` : "."}
                </td>
              </tr>
            ) : null}

            {!isLoading && !isError && items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                  {trimmed.length > 0 ||
                  selectedCompany ||
                  scopeFilter !== "all" ||
                  statusFilter !== "all"
                    ? "No documents match the current filters."
                    : "No documents yet. Save one from the wizard to populate this list."}
                </td>
              </tr>
            ) : null}

            {items.map(doc => (
              <tr
                key={doc.id}
                className={
                  doc.deletedAt ? "bg-red-50/40 hover:bg-red-50" : "hover:bg-slate-50"
                }
              >
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
                <td className="px-4 py-3">
                  <StatusCell doc={doc} />
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {doc.hubspotSyncState === "not_synced" ? (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      Not synced
                    </span>
                  ) : doc.hubspotSyncState === "synced" ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
                      Synced
                    </span>
                  ) : doc.hubspotSyncState === "delete_pending" ? (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Deleting…
                    </span>
                  ) : doc.hubspotSyncState === "delete_failed" ? (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Delete failed
                    </span>
                  ) : (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Failed
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <LastActionCell event={doc.lastEvent} />
                </td>
                <td className="px-4 py-3 text-slate-500">{formatDateTime(doc.createdAt)}</td>
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
