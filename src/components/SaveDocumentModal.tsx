/**
 * SaveDocumentModal — wizard last step "Save to backend" flow.
 *
 * Mirrors SaveCalculatorModal in structure (company typeahead +
 * deal selector + addendum), but POSTs to /api/v1/documents instead
 * of /calculator-configs. The scope is fixed by `wizardDraft.documentScope`
 * — the wizard already exposes a Document Type dropdown on Step 1
 * (offer / agreement / both).
 *
 * Flow:
 *   1. Operator finishes wizard up to Step 7 (Parties).
 *   2. Clicks "Save document".
 *   3. Picks company (typeahead) + optional deal.
 *   4. Optionally writes addendum text (rendered into the PDF).
 *   5. POST → backend allocates BSG-XXXXX → redirect to /documents/:number.
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api/client.js";
import * as documentsApi from "../api/documents.js";
import { useCompanyDeals } from "../hooks/useCompany.js";
import { useCompanySearch } from "../hooks/useCompanySearch.js";
import type { PublicCompany } from "../api/types.js";

export interface SaveDocumentModalProps {
  open: boolean;
  onClose: () => void;
  /**
   * The wizard's current DocumentTemplatePayload (which already
   * matches the shape the PDF builder + future server-side rendering
   * expect). Stored verbatim into documents.payload as JSONB.
   */
  payload: { schemaVersion?: number } & Record<string, unknown>;
  /**
   * Wizard's selected scope ("offer" | "agreement" | "offer_and_agreement").
   * Maps 1:1 to backend's documents.scope CHECK constraint.
   */
  scope: documentsApi.DocumentScope;
}

export function SaveDocumentModal({
  open,
  onClose,
  payload,
  scope
}: SaveDocumentModalProps) {
  const navigate = useNavigate();
  const [companyQuery, setCompanyQuery] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<PublicCompany | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string>("");
  const [addendum, setAddendum] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function resetAndClose(): void {
    setCompanyQuery("");
    setSelectedCompany(null);
    setSelectedDealId("");
    setAddendum("");
    setSubmitting(false);
    setSubmitError(null);
    onClose();
  }

  const companySearch = useCompanySearch(companyQuery);
  const dealsQuery = useCompanyDeals(selectedCompany?.id);

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!selectedCompany) {
      setSubmitError("Please select a company.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Ensure schemaVersion is present — the backend Zod payload
      // schema requires it; wizardDraft today doesn't include it
      // so we inject a v1 marker for forward-compat. When Sprint 4.E
      // wires the wizard properly the wizardDraft itself will carry it.
      const enrichedPayload = {
        schemaVersion: 1,
        ...payload
      } as { schemaVersion: number } & Record<string, unknown>;

      const created = await documentsApi.createDocument({
        companyId: selectedCompany.id,
        hubspotDealId: selectedDealId || null,
        scope,
        payload: enrichedPayload,
        addendum: addendum.trim() ? addendum.trim() : null
      });
      // Skip resetAndClose() — it would briefly flash the cleared
      // modal before the navigate happens. Navigate first, the
      // unmount handles the state.
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
            Saving as <strong className="font-semibold text-slate-700">{scopeLabel}</strong>.
            Backend assigns the next BSG-XXXXX number atomically.
          </p>
        </header>

        {/* Company picker — typeahead. See SaveCalculatorModal for
            the ul-outside-label structure rationale. */}
        <div className="space-y-1">
          <span
            id="company-label"
            className="block text-xs font-semibold uppercase tracking-wide text-slate-600"
          >
            Company *
          </span>
          {selectedCompany ? (
            <div className="mt-1 flex items-center justify-between rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm">
              <span className="font-semibold text-blue-900">{selectedCompany.name}</span>
              <button
                type="button"
                onClick={() => {
                  setSelectedCompany(null);
                  setSelectedDealId("");
                }}
                className="text-xs font-semibold text-blue-700 hover:text-blue-900 hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <>
              <input
                type="search"
                value={companyQuery}
                onChange={e => setCompanyQuery(e.target.value)}
                placeholder="Type at least 2 letters…"
                aria-labelledby="company-label"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              {companySearch.effectiveQuery.length >= 2 ? (
                <ul
                  role="listbox"
                  className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm shadow-sm"
                >
                  {companySearch.isLoading ? (
                    <li className="px-3 py-2 text-slate-500">Searching…</li>
                  ) : companySearch.items.length === 0 ? (
                    <li className="px-3 py-2 text-slate-500">
                      No matches for "{companySearch.effectiveQuery}"
                    </li>
                  ) : (
                    companySearch.items.map(c => (
                      <li
                        key={c.id}
                        role="option"
                        aria-selected="false"
                        className="cursor-pointer px-3 py-2 hover:bg-blue-50"
                        onClick={() => {
                          setSelectedCompany(c);
                          setCompanyQuery("");
                        }}
                      >
                        {c.name}
                      </li>
                    ))
                  )}
                </ul>
              ) : null}
            </>
          )}
        </div>

        {selectedCompany ? (
          <label className="block space-y-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Deal (optional)
            </span>
            {dealsQuery.isLoading ? (
              <p className="text-sm text-slate-500">Loading deals…</p>
            ) : dealsQuery.isError ? (
              <p className="text-sm text-red-600">
                Failed to load deals
                {dealsQuery.error instanceof ApiError ? `: ${dealsQuery.error.message}` : "."}
              </p>
            ) : (
              <select
                value={selectedDealId}
                onChange={e => setSelectedDealId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="">— None (attach to company only) —</option>
                {dealsQuery.items.map(deal => (
                  <option key={deal.id} value={deal.hubspotDealId}>
                    {deal.name}
                    {deal.stage ? ` · ${deal.stage}` : ""}
                  </option>
                ))}
              </select>
            )}
          </label>
        ) : null}

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
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
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
            disabled={submitting || !selectedCompany}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving…" : `Save ${scopeLabel}`}
          </button>
        </footer>
      </form>
    </div>
  );
}
