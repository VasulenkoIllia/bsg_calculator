/**
 * Phase 8 Stage 5 — soft-delete modal for documents.
 *
 * Flow:
 *   1. Operator clicks "Delete document" on DocumentViewPage.
 *   2. Modal opens with the reason dropdown (5 presets) + a free-
 *      text "additional note" textarea.
 *   3. When reason='other', the note field is REQUIRED (form
 *      validation matches the server-side Zod refine).
 *   4. Warning banner reminds the operator that BSG-XXXXX stays
 *      reserved and the HubSpot Note will be hard-deleted.
 *   5. Confirm → DELETE request → on success the parent navigates
 *      back to /documents.
 *
 * Errors:
 *   - 502 HUBSPOT_UNREACHABLE: surfaced inline; the row stays alive
 *     with state='delete_failed' and the operator can retry.
 *   - 409 DOCUMENT_ALREADY_DELETED: operator double-clicked or the
 *     listing was stale — surface "already deleted" inline.
 */

import { useState } from "react";
import { ApiError } from "../api/client.js";
import { deleteDocument } from "../api/documents.js";
import type { DocumentDeletionReason } from "../api/types.js";

interface DeleteDocumentModalProps {
  open: boolean;
  documentNumber: string;
  hasHubspotNote: boolean;
  onClose: () => void;
  onDeleted: () => void;
}

const REASON_OPTIONS: { value: DocumentDeletionReason; label: string }[] = [
  { value: "client_request", label: "Client request" },
  { value: "created_in_error", label: "Created in error" },
  { value: "replaced_by_new_version", label: "Replaced by new version" },
  { value: "duplicate", label: "Duplicate" },
  { value: "other", label: "Other (note required)" }
];

export function DeleteDocumentModal({
  open,
  documentNumber,
  hasHubspotNote,
  onClose,
  onDeleted
}: DeleteDocumentModalProps) {
  const [reason, setReason] = useState<DocumentDeletionReason>("client_request");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset(): void {
    setReason("client_request");
    setNote("");
    setSubmitting(false);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);

    // Match the server-side Zod refine — 'other' requires a non-empty note.
    if (reason === "other" && note.trim().length === 0) {
      setError("Note is required when reason is 'Other'.");
      return;
    }

    setSubmitting(true);
    try {
      await deleteDocument(documentNumber, {
        reason,
        note: note.trim().length > 0 ? note.trim() : null
      });
      onDeleted();
      reset();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "DOCUMENT_ALREADY_DELETED") {
          setError("This document has already been deleted (refresh the page).");
        } else if (err.code === "HUBSPOT_UNREACHABLE") {
          setError(
            "HubSpot is unreachable. The document was NOT deleted. " +
              "Wait a moment and try again — the row is now in 'delete_failed' state."
          );
        } else {
          setError(err.message);
        }
      } else {
        setError("Something went wrong. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-doc-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={event => {
        if (event.target === event.currentTarget) {
          reset();
          onClose();
        }
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <header>
          <h2 id="delete-doc-title" className="text-lg font-semibold text-slate-900">
            Delete document {documentNumber}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            The document will be soft-deleted (BSG-XXXXX stays reserved).
            {hasHubspotNote
              ? " The linked HubSpot Note will be PERMANENTLY deleted."
              : " No HubSpot Note is linked — only the local row is affected."}
          </p>
        </header>

        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Reason <span className="text-red-500">*</span>
          </span>
          <select
            value={reason}
            onChange={e => setReason(e.target.value as DocumentDeletionReason)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            {REASON_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Note {reason === "other" ? <span className="text-red-500">*</span> : "(optional)"}
          </span>
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={4}
            maxLength={8000}
            placeholder="Add context — who asked, what's the replacement BSG, etc."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </label>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {error}
          </p>
        ) : null}

        <footer className="flex items-center justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={submitting}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg border border-red-600 bg-red-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Deleting…" : "Delete document"}
          </button>
        </footer>
      </form>
    </div>
  );
}
