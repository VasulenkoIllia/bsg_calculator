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
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client.js";
import * as documentsApi from "../api/documents.js";
import { CompanyTypeahead } from "../components/CompanyTypeahead.js";
import { DeleteDocumentModal } from "../components/DeleteDocumentModal.js";
import { DeletionStatusCell } from "../components/DeletionStatusCell.js";
import { HubspotSyncBadge } from "../components/HubspotSyncBadge.js";
import { LastActionCell } from "../components/LastActionCell.js";
import { LoadMoreButton } from "../components/LoadMoreButton.js";
import { SortableTh } from "../components/SortableTh.js";
import { DocumentOfferStatus } from "../components/OfferStatusBadge.js";
import { useAuth } from "../contexts/AuthContext.js";
import { useToast } from "../contexts/ToastContext.js";
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
  PublicCompany,
  PublicDocumentListItem
} from "../api/types.js";

// Audit dedup — the Status-cell badge + the deletion-reason humanizer
// now live in shared modules (DeletionStatusCell + deletionReason),
// previously copy-pasted here and in CalculatorsListPage.

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
  // UI-parity — the document whose delete modal is open (null = closed).
  // Mirrors the inline Delete affordance on the Saved-calculators list.
  const [deleteTarget, setDeleteTarget] =
    useState<PublicDocumentListItem | null>(null);
  // Sprint 9.R — inline restore for super_admin. The mutation's
  // `variables` carries the document number being restored, so we
  // can disable just that row's button rather than blocking every
  // Restore on the page at once.
  const { hasRole } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const restoreMutation = useMutation({
    mutationFn: (number: string) => documentsApi.restoreDocument(number),
    onSuccess: async (_data, number) => {
      toast.success(`Restored ${number}`);
      // Refresh the listing AND any cached detail/event queries so
      // navigating into the doc immediately shows the alive state.
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      await queryClient.invalidateQueries({ queryKey: ["document", number] });
      await queryClient.invalidateQueries({
        queryKey: ["document-events", number]
      });
    },
    onError: err => {
      toast.error(err instanceof ApiError ? err.message : "Restore failed.");
    }
  });
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
            {/*
              Sprint 9.Q — only two real scopes the wizard can produce:
              "offer" (Пропозиція) and "offer_and_agreement"
              (Пропозиція + Договір). Standalone "agreement" is a
              valid backend enum value but no creation path actually
              produces it (see WizardPage `toBackendScope` — the
              comment there explicitly calls it out as a product
              decision). Showing "Agreement" in the filter was a
              dead option that confused operators; removed.

              If we ever resurrect agreement-only docs, add the
              option back HERE — the backend filter + enum already
              accept "agreement" as a value, so no API change needed.
            */}
            <option value="all">All scopes</option>
            <option value="offer">Offer</option>
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
              {/* UI-parity — right-most actions column (Open → / Delete),
                  no header label, not sortable. Mirrors the
                  Saved-calculators list. */}
              <th className="px-4 py-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
                  Loading documents…
                </td>
              </tr>
            ) : null}

            {isError ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-red-600">
                  Failed to load documents
                  {error instanceof ApiError ? `: ${error.message}` : "."}
                </td>
              </tr>
            ) : null}

            {!isLoading && !isError && items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
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
                <td className="px-4 py-3 text-slate-700">
                  <div className="flex flex-col items-start gap-1">
                    <span>{formatScopeLabel(doc.scope)}</span>
                    <DocumentOfferStatus scope={doc.scope} payload={doc.payload} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <DeletionStatusCell
                    deletedAt={doc.deletedAt}
                    deletionReason={doc.deletionReason}
                    onRestore={
                      hasRole("super_admin") && doc.deletedAt
                        ? () => restoreMutation.mutate(doc.number)
                        : null
                    }
                    restoring={
                      restoreMutation.isPending &&
                      restoreMutation.variables === doc.number
                    }
                  />
                </td>
                <td className="px-4 py-3 text-slate-500">
                  <HubspotSyncBadge state={doc.hubspotSyncState} />
                </td>
                <td className="px-4 py-3">
                  <LastActionCell event={doc.lastEvent} />
                </td>
                {/*
                  Sprint 9.X.A — show creator below the timestamp.
                  Backend listing now LEFT JOINs `users` on
                  `documents.created_by_user_id`, so each row carries
                  `createdBy.displayName` + `email` (or null if the
                  creator was hard-deleted — FK is ON DELETE SET NULL).
                  We render `displayName` (compact) with `email` as
                  the title attribute for disambiguation on hover.
                */}
                <td className="px-4 py-3 text-slate-500">
                  <div>{formatDateTime(doc.createdAt)}</div>
                  {doc.createdBy ? (
                    <div
                      className="text-xs text-slate-400"
                      title={doc.createdBy.email}
                    >
                      by {doc.createdBy.displayName}
                    </div>
                  ) : null}
                </td>
                {/* UI-parity — Open → / Delete actions (mirrors the
                    Saved-calculators list). The BSG number is still a
                    link (above); this adds an explicit Open + an inline
                    Delete for admins on alive rows. */}
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      to={`/documents/${doc.number}`}
                      className="font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                    >
                      Open →
                    </Link>
                    {hasRole("admin") && !doc.deletedAt ? (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(doc)}
                        className="font-semibold text-red-600 hover:text-red-700 hover:underline"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
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

      {/* UI-parity — soft-delete modal (reason + optional note), mounted
          once at page level and driven by `deleteTarget`. On success we
          close + refetch so the row re-renders with its Deleted badge —
          same flow as the Saved-calculators list. */}
      {deleteTarget ? (
        <DeleteDocumentModal
          open
          documentNumber={deleteTarget.number}
          hasHubspotNote={Boolean(deleteTarget.hubspotNoteId)}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            toast.success(`Deleted ${deleteTarget.number}`);
            void queryClient.invalidateQueries({ queryKey: ["documents"] });
          }}
        />
      ) : null}
    </section>
  );
}
