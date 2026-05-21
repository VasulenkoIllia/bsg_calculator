/**
 * Phase 8 Stage 5 — super_admin-only listing of soft-deleted
 * documents.
 *
 * Mounted at `/admin/documents/deleted`, gated by
 * `<RequireRole min="super_admin" />`. Fetches via
 * `listDocuments({ includeDeleted: 'only' })` — the backend silently
 * coerces this to 'alive' for non-super_admin so the gate at the
 * router is the load-bearing check.
 *
 * Each row links to the document's detail page where the super_admin
 * can hit the existing Restore button (the action lives there, not
 * here, so the audit-log trail is unified).
 */

import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../api/client.js";
import { listDocuments } from "../api/documents.js";
import { formatDateTime, formatScopeLabel } from "../shared/format.js";
import type { DocumentDeletionReason } from "../api/types.js";

function humanReason(reason: DocumentDeletionReason | null): string {
  if (!reason) return "—";
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

export function AdminDeletedDocumentsPage() {
  const query = useQuery({
    queryKey: ["admin", "documents", "deleted"],
    queryFn: () => listDocuments({ includeDeleted: "only", limit: 50 }),
    staleTime: 30_000
  });

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold text-slate-900">Deleted documents</h1>
        <p className="text-sm text-slate-500">
          Soft-deleted documents (super-admin only). Click a row to open
          the detail page and use the Restore button.
        </p>
      </header>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-2 text-left">Number</th>
              <th className="px-4 py-2 text-left">Company</th>
              <th className="px-4 py-2 text-left">Scope</th>
              <th className="px-4 py-2 text-left">Reason</th>
              <th className="px-4 py-2 text-left">Deleted</th>
              <th className="px-4 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-slate-800">
            {query.isLoading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                  Loading deleted documents…
                </td>
              </tr>
            ) : query.isError ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-red-600">
                  Failed to load
                  {query.error instanceof ApiError ? `: ${query.error.message}` : "."}
                </td>
              </tr>
            ) : query.data?.items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-500">
                  No soft-deleted documents.
                </td>
              </tr>
            ) : (
              query.data?.items.map(doc => (
                <tr key={doc.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono">{doc.number}</td>
                  <td className="px-4 py-2">{doc.companyName ?? "—"}</td>
                  <td className="px-4 py-2 text-xs">{formatScopeLabel(doc.scope)}</td>
                  <td className="px-4 py-2 text-xs">
                    {humanReason(doc.deletionReason)}
                    {doc.deletionNote ? (
                      <span
                        className="ml-1 text-slate-400"
                        title={doc.deletionNote}
                      >
                        (·)
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-500">
                    {doc.deletedAt ? formatDateTime(doc.deletedAt) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      to={`/documents/${doc.number}`}
                      className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Open →
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
