/**
 * Sprint 9.U — Audit log page (super_admin only).
 *
 * Lists `admin_actions` rows newest-first with an optional
 * action-type filter. Load-more pagination via opaque cursor.
 *
 * Gated by `<RequireRole min="super_admin" />` at the router layer.
 */

import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ApiError } from "../api/client.js";
import {
  ADMIN_ACTION_TYPES,
  formatAdminActionType,
  listAdminActions,
  type AdminAction,
  type AdminActionTargetType,
  type AdminActionType,
  type AdminActionsPage
} from "../api/admin-actions.js";
import { listUsers } from "../api/users.js";
import { CompanyTypeahead } from "../components/CompanyTypeahead.js";
import { LoadMoreButton } from "../components/LoadMoreButton.js";
import { formatDateTime } from "../shared/format.js";
import type { PublicCompany } from "../api/types.js";

/**
 * Sprint 9.X.C — controlled vocabulary for the targetType dropdown.
 * Keep in lockstep with `adminActionTargetTypeSchema` on the server.
 * "all" is the FE-only sentinel for "no filter".
 */
const TARGET_TYPE_OPTIONS: readonly { value: AdminActionTargetType; label: string }[] = [
  { value: "document", label: "Document" },
  { value: "calc_config", label: "Calculator" },
  { value: "user", label: "User" },
  { value: "invite", label: "Invite" },
  { value: "reset", label: "Password reset" }
];

export function AuditLogPage() {
  const [actionType, setActionType] = useState<AdminActionType | "all">("all");
  // Sprint 9.X.C — three new filters wired into the same useInfiniteQuery
  // key so changing any of them resets pagination cleanly.
  const [selectedCompany, setSelectedCompany] = useState<PublicCompany | null>(
    null
  );
  const [targetType, setTargetType] = useState<AdminActionTargetType | "all">(
    "all"
  );
  const [actorUserId, setActorUserId] = useState<string | "all">("all");

  // Sprint 9.X.C — actor dropdown pulls the active-user list. This is
  // super_admin-only on the server, but so is /audit-log, so we can
  // safely call it here. `staleTime: Infinity` is OK — the dropdown
  // doesn't need to react to a new user being added in the same session.
  const usersQuery = useQuery({
    queryKey: ["admin", "audit-log", "users-dropdown"],
    queryFn: listUsers,
    staleTime: Infinity
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error
  } = useInfiniteQuery<AdminActionsPage, ApiError>({
    queryKey: [
      "admin",
      "audit-log",
      actionType,
      selectedCompany?.id ?? null,
      targetType,
      actorUserId
    ],
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as
        | { id: string; createdAt: string }
        | undefined;
      return listAdminActions({
        actionType: actionType === "all" ? undefined : actionType,
        companyId: selectedCompany?.id,
        targetType: targetType === "all" ? undefined : targetType,
        actorUserId: actorUserId === "all" ? undefined : actorUserId,
        cursorId: cursor?.id,
        cursorCreatedAt: cursor?.createdAt
      });
    },
    getNextPageParam: last => last.nextCursor ?? undefined
  });

  const items = data?.pages.flatMap(p => p.items) ?? [];

  return (
    <section className="space-y-4">
      <header className="space-y-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Audit log</h1>
          <p className="text-sm text-slate-500">
            Privileged actions across the system. Newest first. Super-admin
            only.
          </p>
        </div>
        {/* Sprint 9.X.C — 4-up filter strip: action / target / company /
            actor. Stacks on mobile, grids on sm+ so the operator can
            combine filters (e.g. "all calc.updated for Acme by Bob"). */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Filter by action
            </span>
            <select
              value={actionType}
              onChange={e =>
                setActionType(e.target.value as AdminActionType | "all")
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">All actions</option>
              {ADMIN_ACTION_TYPES.map(t => (
                <option key={t} value={t}>
                  {formatAdminActionType(t)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Filter by target
            </span>
            <select
              value={targetType}
              onChange={e =>
                setTargetType(e.target.value as AdminActionTargetType | "all")
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="all">All targets</option>
              {TARGET_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {/* CompanyTypeahead — handles "no selection" via null, so we
              can clear it from the wrapper button below. */}
          <CompanyTypeahead
            selected={selectedCompany}
            onSelectedChange={setSelectedCompany}
            label="Filter by company"
            placeholder="Click to browse, or type to filter…"
          />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Filter by actor
            </span>
            <select
              value={actorUserId}
              onChange={e => setActorUserId(e.target.value)}
              disabled={usersQuery.isLoading}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:opacity-50"
            >
              <option value="all">Anyone</option>
              {usersQuery.data?.items.map(u => (
                <option key={u.id} value={u.id}>
                  {u.displayName} ({u.email})
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-2 text-left">When</th>
              <th className="px-4 py-2 text-left">Actor</th>
              <th className="px-4 py-2 text-left">Action</th>
              <th className="px-4 py-2 text-left">Target</th>
              <th className="px-4 py-2 text-left">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {isLoading ? (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={5}>
                  Loading…
                </td>
              </tr>
            ) : isError ? (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-red-600" colSpan={5}>
                  Failed to load audit log{error ? `: ${error.message}` : "."}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={5}>
                  No audit entries match the current filter.
                </td>
              </tr>
            ) : (
              items.map(action => <AuditRow key={action.id} action={action} />)
            )}
          </tbody>
        </table>
      </div>

      <LoadMoreButton
        hasNextPage={!!hasNextPage}
        isFetchingNextPage={isFetchingNextPage}
        fetchNextPage={fetchNextPage}
      />
    </section>
  );
}

function AuditRow({ action }: { action: AdminAction }) {
  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-3 text-xs text-slate-500">
        {formatDateTime(action.createdAt)}
      </td>
      <td className="px-4 py-3 text-xs text-slate-700">
        {action.actorDisplayName}
        <br />
        <span className="text-slate-400">{action.actorEmail}</span>
      </td>
      <td className="px-4 py-3 text-sm text-slate-800">
        {formatAdminActionType(action.actionType)}
      </td>
      <td className="px-4 py-3 text-xs text-slate-600">
        {action.targetType ? (
          <>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-600">
              {action.targetType}
            </span>
            <br />
            <span className="font-mono text-slate-500">
              {action.targetId ?? "—"}
            </span>
          </>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {Object.keys(action.meta).length > 0 ? (
          <code className="font-mono text-[10px]">
            {JSON.stringify(action.meta)}
          </code>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}
