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
import type { PublicCompany } from "../api/types.js";
import { CompanyTypeahead } from "./CompanyTypeahead.js";

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
  // Sprint 6.6: companyQuery state moved INTO the shared
  // CompanyTypeahead component — modal no longer needs to mirror it.
  const [selectedCompany, setSelectedCompany] = useState<PublicCompany | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string>(""); // "" = none
  const [title, setTitle] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset everything when the modal closes so a re-open starts fresh.
  function resetAndClose(): void {
    setSelectedCompany(null);
    setSelectedDealId("");
    setTitle("");
    setSubmitting(false);
    setSubmitError(null);
    onClose();
  }

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

        {/* Sprint 6.6: shared CompanyTypeahead replaces the inline
            picker. Dropdown opens on focus, browse mode lists the
            first 10 companies before any typing. */}
        <CompanyTypeahead
          selected={selectedCompany}
          onSelectedChange={c => {
            setSelectedCompany(c);
            // Clearing the company also clears the dependent deal pin —
            // a pin for company A would be cross-company nonsense if
            // the operator switches to company B.
            if (!c) setSelectedDealId("");
          }}
          required
        />

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
