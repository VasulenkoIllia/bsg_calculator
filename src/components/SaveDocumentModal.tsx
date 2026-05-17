/**
 * SaveDocumentModal — wizard final-save confirmation.
 *
 * Sprint 4.E revision (2026-05-17): the company + deal picker moved
 * to <WizardBackendBar /> at the top of /wizard, so this modal now
 * only collects the addendum text and confirms the save. Backend
 * still POSTs to /api/v1/documents and the BSG-XXXXX is allocated
 * atomically inside the TX.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client.js";
import * as documentsApi from "../api/documents.js";
import type { DocumentTemplatePayload } from "./document-wizard/index.js";

export interface SaveDocumentModalProps {
  open: boolean;
  onClose: () => void;
  /** From WizardBackendBar — already-picked target company UUID. */
  companyId: string;
  /** From WizardBackendBar — HubSpot deal natural key, or "" for none. */
  hubspotDealId: string;
  /** From WizardBackendBar — friendly company name for the confirmation copy. */
  companyName: string;
  /**
   * The wizard's current DocumentTemplatePayload. Stored verbatim into
   * documents.payload as JSONB. The modal injects `schemaVersion: 1`
   * automatically on submit — wizardDraft doesn't carry that field
   * by design (it's a server-side migration marker, not a wizard one).
   */
  payload: DocumentTemplatePayload;
  scope: documentsApi.DocumentScope;
}

export function SaveDocumentModal({
  open,
  onClose,
  companyId,
  hubspotDealId,
  companyName,
  payload,
  scope
}: SaveDocumentModalProps) {
  const navigate = useNavigate();
  const [addendum, setAddendum] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function resetAndClose(): void {
    setAddendum("");
    setSubmitting(false);
    setSubmitError(null);
    onClose();
  }

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Cast through a clean "object that has schemaVersion" shape;
      // the backend Zod payload schema requires that field but treats
      // everything else as passthrough. JSON.stringify will spread
      // wizardDraft's typed properties without TypeScript complaint
      // because Record<string, unknown> is wide enough.
      const enrichedPayload: { schemaVersion: number } & Record<string, unknown> = {
        schemaVersion: 1,
        ...(payload as unknown as Record<string, unknown>)
      };

      const created = await documentsApi.createDocument({
        companyId,
        hubspotDealId: hubspotDealId || null,
        scope,
        payload: enrichedPayload,
        addendum: addendum.trim() ? addendum.trim() : null
      });
      navigate(`/documents/${created.number}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(err.message);
      } else {
        // eslint-disable-next-line no-console
        console.error("[SaveDocumentModal] unexpected", err);
        setSubmitError("Something went wrong. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const scopeLabel =
    scope === "offer"
      ? "Offer"
      : scope === "agreement"
        ? "Agreement"
        : "Offer + Agreement";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-doc-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={event => {
        if (event.target === event.currentTarget) resetAndClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <header>
          <h2 id="save-doc-title" className="text-lg font-semibold text-slate-900">
            Save document
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Saving <strong className="font-semibold text-slate-700">{scopeLabel}</strong> for{" "}
            <strong className="font-semibold text-slate-700">{companyName}</strong>.
            Backend assigns the next BSG-XXXXX number atomically.
          </p>
        </header>

        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Addendum (optional)
          </span>
          <textarea
            value={addendum}
            onChange={e => setAddendum(e.target.value)}
            placeholder="Special terms applicable only to this document. Rendered into the PDF."
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </label>

        {submitError ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
          >
            {submitError}
          </p>
        ) : null}

        <footer className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={resetAndClose}
            disabled={submitting}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving…" : `Save ${scopeLabel}`}
          </button>
        </footer>
      </form>
    </div>
  );
}
