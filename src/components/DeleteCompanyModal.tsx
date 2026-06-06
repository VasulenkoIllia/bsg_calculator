/**
 * Admin "Delete company from the system" confirmation modal.
 *
 * Shown ONLY for a company that HubSpot already deleted (the parent gates
 * on `hubspotDeletedAt` + `hasRole("admin")`). Confirming permanently
 * hard-deletes the company + ALL its documents/deals/configs from OUR DB
 * (HubSpot is untouched — it's already gone there). Irreversible.
 */

import { useState } from "react";
import { ApiError } from "../api/client.js";
import { purgeCompany, type PurgedCompanySummary } from "../api/companies.js";

interface DeleteCompanyModalProps {
  open: boolean;
  companyId: string;
  companyName: string;
  onClose: () => void;
  onPurged: (summary: PurgedCompanySummary) => void;
}

export function DeleteCompanyModal({
  open,
  companyId,
  companyName,
  onClose,
  onPurged
}: DeleteCompanyModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const summary = await purgeCompany(companyId);
      onPurged(summary);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
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
      aria-labelledby="delete-company-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={event => {
        if (event.target === event.currentTarget && !submitting) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <header>
          <h2 id="delete-company-title" className="text-lg font-semibold text-slate-900">
            Delete “{companyName}” from the system
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            This permanently removes the company and <strong>all</strong> of its
            documents, deals, saved calculators, and audit history from our
            database. HubSpot is not affected (the company is already deleted
            there). This cannot be undone.
          </p>
        </header>

        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Only do this for a company that was deleted in HubSpot and whose
          documents are no longer needed.
        </p>

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
            onClick={onClose}
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
            {submitting ? "Deleting…" : "Delete permanently"}
          </button>
        </footer>
      </form>
    </div>
  );
}
