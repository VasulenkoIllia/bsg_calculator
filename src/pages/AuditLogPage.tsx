/**
 * Sprint 9.U — Audit log page (super_admin only).
 *
 * Lists `admin_actions` rows newest-first with an optional
 * action-type filter. Load-more pagination via opaque cursor.
 *
 * Gated by `<RequireRole min="super_admin" />` at the router layer.
 */

import { useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { ApiError } from "../api/client.js";
import {
  ADMIN_ACTION_TYPES,
  formatAdminActionType,
  listAdminActions,
  type AdminAction,
  type AdminActionType,
  type AdminActionsPage
} from "../api/admin-actions.js";
import { LoadMoreButton } from "../components/LoadMoreButton.js";
import { formatDateTime } from "../shared/format.js";

export function AuditLogPage() {
  const [actionType, setActionType] = useState<AdminActionType | "all">("all");

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    isError,
    error
  } = useInfiniteQuery<AdminActionsPage, ApiError>({
    queryKey: ["admin", "audit-log", actionType],
    initialPageParam: undefined,
    queryFn: async ({ pageParam }) => {
      const cursor = pageParam as
        | { id: string; createdAt: string }
        | undefined;
      return listAdminActions({
        actionType: actionType === "all" ? undefined : actionType,
        cursorId: cursor?.id,
        cursorCreatedAt: cursor?.createdAt
      });
    },
    getNextPageParam: last => last.nextCursor ?? undefined
  });

  const items = data?.pages.flatMap(p => p.items) ?? [];

  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Audit log</h1>
          <p className="text-sm text-slate-500">
            Privileged actions across the system. Newest first. Super-admin
            only.
          </p>
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Filter by action
          </span>
          <select
            value={actionType}
            onChange={e =>
              setActionType(e.target.value as AdminActionType | "all")
            }
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100 sm:w-64"
          >
            <option value="all">All actions</option>
            {ADMIN_ACTION_TYPES.map(t => (
              <option key={t} value={t}>
                {formatAdminActionType(t)}
              </option>
            ))}
          </select>
        </label>
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
