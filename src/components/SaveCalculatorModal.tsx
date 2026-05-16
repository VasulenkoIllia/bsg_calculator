/**
 * SaveCalculatorModal — gathers (company + optional deal + optional title)
 * and POSTs the current calculator snapshot to /api/v1/calculator-configs.
 *
 * Flow:
 *   1. Operator clicks "Save calculator" on the CalculatorPage.
 *   2. Modal opens with company typeahead. Operator types ≥ 2 chars,
 *      sees suggestions, picks one.
 *   3. Once a company is selected, the deal dropdown populates with
 *      that company's deals; operator can leave it as "— none —"
 *      (company-level draft) or pin to a specific deal.
 *   4. Optional title.
 *   5. Click "Save" → POST → toast on success → modal closes.
 *
 * Errors:
 *   - Backend ApiError surfaced inline at the bottom of the form.
 *   - Most likely failure modes: VALIDATION_FAILED (cross-company
 *     deal — shouldn't happen since UI restricts deal selector to the
 *     selected company), 401 (refresh handled by interceptor).
 */

import { useState } from "react";
import { ApiError } from "../api/client.js";
import * as calculatorConfigsApi from "../api/calculator-configs.js";
import { useCompanyDeals } from "../hooks/useCompany.js";
import { useCompanySearch } from "../hooks/useCompanySearch.js";
import type { PublicCompany } from "../api/types.js";

export interface SaveCalculatorModalProps {
  /** True → modal visible. Parent controls open/close. */
  open: boolean;
  /** Called when modal should close (Cancel or successful save). */
  onClose: () => void;
  /**
   * The calculator snapshot to persist. Caller extracts this via
   * `extractCalculatorSnapshot(state)` before opening the modal.
   */
  payload: { schemaVersion: number } & Record<string, unknown>;
  /** Optional callback fired on success with the created config id. */
  onSaved?: (configId: string) => void;
}

export function SaveCalculatorModal({
  open,
  onClose,
  payload,
  onSaved
}: SaveCalculatorModalProps) {
  // Local form state — kept here rather than react-hook-form because
  // the typeahead + dependent deal selector aren't idiomatic in RHF's
  // controlled-input model, and the form has only three fields.
  const [companyQuery, setCompanyQuery] = useState("");
  const [selectedCompany, setSelectedCompany] = useState<PublicCompany | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string>(""); // "" = none
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset everything when the modal closes so a re-open starts fresh.
  function resetAndClose(): void {
    setCompanyQuery("");
    setSelectedCompany(null);
    setSelectedDealId("");
    setTitle("");
    setSubmitting(false);
    setSubmitError(null);
    onClose();
  }

  const companySearch = useCompanySearch(companyQuery);
  // Load deals for the selected company. `enabled` inside
  // useCompanyDeals already gates on companyId being a non-empty
  // string, so no extra guard needed.
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
      const created = await calculatorConfigsApi.createCalculatorConfig({
        companyId: selectedCompany.id,
        hubspotDealId: selectedDealId || null,
        title: title.trim() ? title.trim() : null,
        payload
      });
      onSaved?.(created.id);
      resetAndClose();
    } catch (err) {
      // ApiError surface the backend message + code; anything else is
      // an unexpected client-side bug.
      if (err instanceof ApiError) {
        setSubmitError(err.message);
      } else {
        // eslint-disable-next-line no-console
        console.error("[SaveCalculatorModal] unexpected error", err);
        setSubmitError("Something went wrong. Try again.");
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
      aria-labelledby="save-calc-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={event => {
        // Click outside the form panel → close. Stop propagation in
        // the panel so internal clicks don't also bubble.
        if (event.target === event.currentTarget) resetAndClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <header>
          <h2 id="save-calc-title" className="text-lg font-semibold text-slate-900">
            Save calculator
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Attach this draft to a company. You can also pin it to a specific deal.
          </p>
        </header>

        {/* Title (optional) */}
        <label className="block space-y-1">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
            Title (optional)
          </span>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="e.g. Q1 onboarding draft"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </label>

        {/* Company picker — typeahead. The suggestion <ul> sits OUTSIDE
            the <label> wrapper so a click on a <li> selects the option
            rather than getting eaten by the label's default focus-the-
            input behaviour. */}
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
                aria-autocomplete="list"
                aria-controls="company-suggestions"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              {companySearch.effectiveQuery.length >= 2 ? (
                <ul
                  id="company-suggestions"
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

        {/* Deal selector — only when a company is picked. */}
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
                {dealsQuery.error instanceof ApiError
                  ? `: ${dealsQuery.error.message}`
                  : "."}
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
            disabled={submitting || !selectedCompany}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Saving…" : "Save"}
          </button>
        </footer>
      </form>
    </div>
  );
}
