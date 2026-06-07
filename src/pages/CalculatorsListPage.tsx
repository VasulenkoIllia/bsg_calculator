/**
 * Top-level "Saved Calculators" workspace tab — Sprint 6.6.
 *
 * Closes the discoverability gap flagged after Sprint 6.4: until
 * this page existed, the only path to a saved calc was
 * Companies → click company → Saved-calculators tab. That
 * required remembering which company a config was saved against,
 * and bookmarking /calc/:id directly was the only stable path.
 *
 * This page lists every calc-config the operator has access to,
 * with substring search on title and per-row company badge so the
 * operator can see at a glance which company each draft belongs to.
 * Companion to /documents (which already had a parallel listing
 * page since Sprint 4.D).
 *
 * Backend contract: `GET /api/v1/calculator-configs` with no
 * companyId — Sprint 6.6 relaxed the parameter from required to
 * optional for this exact use case. `q` is substring-on-title with
 * LIKE-escape on the server side.
 *
 * Each row's "Open →" link routes to /calc/:id, where the existing
 * /calc/:id edit-mode UX takes over (hydration + auto-save + the
 * SavedStatusBadge + DocumentsFromCalcSection history strip).
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isDocumentTemplatePayload } from "../components/document-wizard/isDocumentTemplatePayload.js";
import { ApiError } from "../api/client.js";
import * as configsApi from "../api/calculator-configs.js";
import { CompanyTypeahead } from "../components/CompanyTypeahead.js";
import { DeleteCalculatorModal } from "../components/DeleteCalculatorModal.js";
import { LastActionCell } from "../components/LastActionCell.js";
import { LoadMoreButton } from "../components/LoadMoreButton.js";
import { SortableTh } from "../components/SortableTh.js";
import { useAuth } from "../contexts/AuthContext.js";
import { useToast } from "../contexts/ToastContext.js";
import { useCalculatorConfigs } from "../hooks/useCalculatorConfig.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { useSortState } from "../hooks/useSortState.js";
import { formatDateTime } from "../shared/format.js";
import type {
  CalculatorConfigDeletionReason,
  CalculatorConfigSortField
} from "../api/calculator-configs.js";
import type {
  PublicCalculatorConfigListItem,
  PublicCompany
} from "../api/types.js";

/**
 * Cycle 2 — humanise the deletion reason enum for the Status badge.
 * Mirrors DocumentsListPage.humanReason; kept inline (7 lines) so the
 * page stays self-contained.
 */
function humanReason(reason: CalculatorConfigDeletionReason): string {
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
 * Cycle 2 — Status column renderer (parity with DocumentsListPage).
 * Active (alive) vs Deleted (with reason inline + an optional inline
 * Restore button for super_admin). The calculator DOMAIN is frozen —
 * this lives only in the list, never the sticky toolbar.
 */
function StatusCell({
  cfg,
  onRestore,
  restoring
}: {
  cfg: PublicCalculatorConfigListItem;
  onRestore: (() => void) | null;
  restoring: boolean;
}) {
  if (cfg.deletedAt) {
    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex w-fit items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-700">
          Deleted
        </span>
        {cfg.deletionReason ? (
          <span className="text-xs text-slate-500">
            {humanReason(cfg.deletionReason)}
          </span>
        ) : null}
        {onRestore ? (
          <button
            type="button"
            onClick={onRestore}
            disabled={restoring}
            className="mt-0.5 w-fit rounded border border-green-500 bg-white px-2 py-0.5 text-[10px] font-semibold text-green-700 hover:bg-green-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {restoring ? "Restoring…" : "Restore"}
          </button>
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

type StatusFilter = "all" | "active" | "deleted";

export function CalculatorsListPage() {
  // Sprint 9.R — `user` is the read-only tier (no calc creation /
  // edit / delete). Use this gate to hide write affordances.
  const { hasRole } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  // Sprint 9.W — optional company filter (parallel with the same
  // affordance on /documents). Backend + hook already accept
  // `companyId`; this just surfaces the UI.
  const [selectedCompany, setSelectedCompany] = useState<PublicCompany | null>(
    null
  );
  // Cycle 2 — soft-delete scope filter (All / Active / Deleted).
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  // Cycle 2 — the calc whose delete modal is open (null = closed).
  const [deleteTarget, setDeleteTarget] =
    useState<PublicCalculatorConfigListItem | null>(null);
  // Cycle 2 — inline restore for super_admin. The mutation `variables`
  // carries the calc id so we can disable just that row's button.
  const restoreMutation = useMutation({
    mutationFn: (id: string) => configsApi.restoreCalculatorConfig(id),
    onSuccess: async (_data, id) => {
      toast.success("Calculator restored");
      await queryClient.invalidateQueries({ queryKey: ["calculator-configs"] });
      await queryClient.invalidateQueries({
        queryKey: ["calculator-configs", "get", id]
      });
    },
    onError: err => {
      toast.error(err instanceof ApiError ? err.message : "Restore failed.");
    }
  });
  // 300ms debounce on the title-substring query so a fast typist
  // doesn't fire a request per keystroke. Mirrors the pattern used
  // on /documents (DocumentsListPage) and the company-typeahead.
  const q = useDebouncedValue(searchInput, 300);
  // Sprint 7.2: shared sort-state hook (was 6 lines of useState pairs).
  const { sortField, sortDir, sortSpec, handleSortChange } =
    useSortState<CalculatorConfigSortField>("createdAt", "desc");

  const configs = useCalculatorConfigs({
    q,
    companyId: selectedCompany?.id,
    // When a company is selected, drop the deal-pin filter so the
    // operator sees BOTH deal-pinned and company-level drafts for
    // that company. Without showAll the list would default to
    // company-level only.
    showAll: selectedCompany ? true : undefined,
    status: statusFilter,
    sort: sortSpec
  });
  // Sprint 6.7 audit fix (S9): mirror the DocumentsListPage UX —
  // when TanStack Query is re-fetching the listing (e.g. after a
  // window-focus or a mutation invalidates the cache) show a
  // "refreshing…" hint inline so the operator sees the staleness
  // signal. The initial-load case keeps using the table-row spinner;
  // this only fires on background re-fetches with stale data still
  // visible.
  const isBackgroundRefetching = configs.isFetching && !configs.isLoading;

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Saved calculators
            {isBackgroundRefetching ? (
              <span className="ml-2 text-xs font-normal text-slate-400">
                · refreshing…
              </span>
            ) : null}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Every calculator draft you&apos;ve saved. Each is owned by a
            company; click <strong>Open →</strong> to keep editing it
            (auto-save) or to launch the wizard from it.
          </p>
        </div>
        {/* Sprint 9.R — hide "+ New calculator" for read-only `user`s.
            The /calculator route itself is still reachable (they
            can run computations), they just can't persist them. */}
        {hasRole("admin") ? (
          <Link
            to="/calculator"
            className="rounded-lg border border-blue-500 bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            + New calculator
          </Link>
        ) : null}
      </header>

      {/* Sprint 9.W — filter strip: company typeahead + title search.
          Mirror of the /documents listing filter row. */}
      <div className="flex flex-col flex-wrap gap-3 sm:flex-row sm:items-end">
        <CompanyTypeahead
          selected={selectedCompany}
          onSelectedChange={setSelectedCompany}
          label="Filter by company"
          placeholder="Click to browse, or type to filter…"
          className="w-full sm:w-72"
        />
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Search by title
          </span>
          <input
            type="search"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="e.g. Q1 pricing"
            aria-label="Search saved calculators by title"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-64"
          />
        </label>
        {/* Cycle 2 — soft-delete scope filter. Default "All" shows
            deleted rows with a badge (matches /documents). */}
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Status
          </span>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            aria-label="Filter saved calculators by status"
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
                field="title"
                activeField={sortField}
                activeDirection={sortDir}
                onSortChange={handleSortChange}
              >
                Title
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
                field="hubspotDealId"
                activeField={sortField}
                activeDirection={sortDir}
                onSortChange={handleSortChange}
                tooltip="HubSpot deal ID if the draft is pinned to a specific deal, or 'company-level' if it's available to any deal of the parent company."
              >
                Deal
              </SortableTh>
              <SortableTh
                field="updatedAt"
                activeField={sortField}
                activeDirection={sortDir}
                onSortChange={handleSortChange}
              >
                Updated
              </SortableTh>
              {/* Cycle 2 — soft-delete status (Active / Deleted + reason
                  + inline Restore). Not sortable (the backend doesn't
                  expose deleted_at as a sort key). */}
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Status
              </th>
              {/* Sprint 9.N — Last action column populated from
                  calculator_config_events via LATERAL subquery on
                  the listing endpoint. */}
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                Last action
              </th>
              {/* Right-most action column has no header label and is
                  not sortable — the Open → link is row-level. */}
              <th className="px-4 py-3" aria-label="Actions" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {configs.isLoading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                  Loading saved calculators…
                </td>
              </tr>
            ) : null}

            {configs.isError ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-red-600">
                  Failed to load calculators
                  {configs.error instanceof ApiError ? `: ${configs.error.message}` : "."}
                </td>
              </tr>
            ) : null}

            {!configs.isLoading && !configs.isError && configs.items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-500">
                  {q.trim() || selectedCompany
                    ? "No saved calculators match the current filters."
                    : "No saved calculators yet. Open the calculator and click Save calculator to persist one."}
                </td>
              </tr>
            ) : null}

            {configs.items.map(cfg => {
              // A config created via "Use as Template" on a DOCUMENT carries a
              // DocumentTemplatePayload (a wizard draft), NOT a calculator
              // snapshot — /calc/:id can't hydrate it and bounces to the
              // wizard. Detect it here so the row is badged "Document draft"
              // and its Open link goes STRAIGHT to the wizard (no surprise
              // redirect). See CalculatorPage's hydration guard.
              const isDocDraft = isDocumentTemplatePayload(cfg.payload);
              // Cycle 2 — tint soft-deleted rows red (matches /documents).
              const isDeleted = Boolean(cfg.deletedAt);
              return (
              <tr
                key={cfg.id}
                className={
                  isDeleted ? "bg-red-50/40 hover:bg-red-50" : "hover:bg-slate-50"
                }
              >
                <td className="px-4 py-3 font-medium text-slate-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>
                      {cfg.title ?? <span className="text-slate-400">(untitled)</span>}
                    </span>
                    {isDocDraft ? (
                      <span
                        className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700"
                        title="Created via “Use as Template” on a document — opens in the Contract Wizard, not the calculator."
                      >
                        Document draft
                      </span>
                    ) : null}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {/*
                    Sprint 6.7 audit fix (S4): backend list endpoint
                    now JOINs companies and returns `companyName`, so
                    each row identifies its parent at a glance. Click
                    routes through to /companies/:id for full detail.
                    Fallback handles the edge case where the JOIN
                    didn't populate the name (shouldn't happen given
                    the FK, but defensive).
                  */}
                  <Link
                    to={`/companies/${cfg.companyId}`}
                    className="font-medium text-blue-700 hover:text-blue-900 hover:underline"
                  >
                    {/* Sprint 6.9 S12: PublicCalculatorConfigListItem
                        guarantees companyName via INNER JOIN; no
                        fallback needed. */}
                    {cfg.companyName} →
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {cfg.hubspotDealId ? (
                    <span className="font-mono text-xs">{cfg.hubspotDealId}</span>
                  ) : (
                    <span className="text-slate-400">company-level</span>
                  )}
                </td>
                {/*
                  Sprint 9.X.A — render creator below the Updated
                  timestamp. Calc-configs are mutable (Updated ≠
                  Created semantically), so we explicitly label
                  "Created by …" to keep meaning unambiguous. The
                  LastAction column already shows the most-recent
                  editor — this surfaces the original author.
                  Sourced from the listing endpoint's LEFT JOIN on
                  `users.created_by_user_id`; null if the creator
                  was hard-deleted (FK is ON DELETE SET NULL).
                */}
                <td className="px-4 py-3 text-slate-500">
                  <div>{formatDateTime(cfg.updatedAt)}</div>
                  {cfg.createdBy ? (
                    <div
                      className="text-xs text-slate-400"
                      title={cfg.createdBy.email}
                    >
                      Created by {cfg.createdBy.displayName}
                    </div>
                  ) : null}
                </td>
                {/* Cycle 2 — Status (Active / Deleted + reason +
                    super_admin inline Restore). */}
                <td className="px-4 py-3">
                  <StatusCell
                    cfg={cfg}
                    onRestore={
                      hasRole("super_admin") && isDeleted
                        ? () => restoreMutation.mutate(cfg.id)
                        : null
                    }
                    restoring={
                      restoreMutation.isPending &&
                      restoreMutation.variables === cfg.id
                    }
                  />
                </td>
                <td className="px-4 py-3">
                  <LastActionCell event={cfg.lastEvent} />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-3">
                    <Link
                      to={isDocDraft ? `/wizard?calc=${cfg.id}` : `/calc/${cfg.id}`}
                      className="font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                    >
                      {isDocDraft ? "Open in wizard →" : "Open →"}
                    </Link>
                    {/* Cycle 2 — Delete (admin+, alive rows only). Opens
                        the reason/note modal; the calculator DOMAIN is
                        untouched — this is a list-level affordance. */}
                    {hasRole("admin") && !isDeleted ? (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(cfg)}
                        className="font-semibold text-red-600 hover:text-red-700 hover:underline"
                      >
                        Delete
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <LoadMoreButton
        hasNextPage={configs.hasNextPage}
        isFetchingNextPage={configs.isFetchingNextPage}
        fetchNextPage={configs.fetchNextPage}
        label="Load more calculators"
      />

      {/* Cycle 2 — soft-delete modal (reason + optional note). Mounted
          once at page level; `deleteTarget` drives which calc it acts
          on. On success we close + refetch so the row re-renders with
          its "Deleted" badge. */}
      {deleteTarget ? (
        <DeleteCalculatorModal
          open
          calculatorId={deleteTarget.id}
          calculatorTitle={deleteTarget.title}
          hasHubspotNote={Boolean(deleteTarget.hubspotNoteId)}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            toast.success("Calculator deleted");
            void queryClient.invalidateQueries({
              queryKey: ["calculator-configs"]
            });
          }}
        />
      ) : null}
    </section>
  );
}
