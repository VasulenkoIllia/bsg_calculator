/**
 * Wizard backend bar — picks the document's target company + deal.
 *
 * Rendered INSIDE Step 1 (Header / Meta) on /wizard so the operator
 * commits to a save target before touching pricing. Once a company
 * is picked, the wizard's Document Number field (in HeaderMetaStep)
 * gets refreshed with the backend's BSG-<seq>-<companyTail6> preview.
 *
 * NOTE: there is NO Save button in this bar. The operator saves on
 * the Preview step only — after running through every wizard step
 * and reviewing the final document. Decision recorded 2026-05-17:
 * one save-trigger location avoids accidental mid-edit submissions.
 */

import { useEffect } from "react";
import { ApiError } from "../api/client.js";
import { useCompanyDeals } from "../hooks/useCompany.js";
import type { PublicCompany } from "../api/types.js";
import { CompanyTypeahead } from "./CompanyTypeahead.js";

export interface WizardBackendBarProps {
  selectedCompany: PublicCompany | null;
  onCompanyChange: (company: PublicCompany | null) => void;
  selectedDealId: string;
  onDealIdChange: (dealId: string) => void;
}

export function WizardBackendBar({
  selectedCompany,
  onCompanyChange,
  selectedDealId,
  onDealIdChange
}: WizardBackendBarProps) {
  // Sprint 6.6: company picker UI moved into the shared
  // CompanyTypeahead component (dropdown-on-focus pattern).
  const dealsQuery = useCompanyDeals(selectedCompany?.id);

  // Clear the deal selection when the company changes — a deal of
  // company A can never belong to company B (backend would 422).
  useEffect(() => {
    onDealIdChange("");
  }, [selectedCompany?.id, onDealIdChange]);

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-blue-900">
          Backend save target
        </p>
        <p className="mt-1 text-xs text-blue-800">
          Pick the company first — Document Number above updates with the
          actual BSG-XXXXXXX-YYYYYY that will be reserved on save. The
          Save button itself lives on the Preview step.
        </p>
      </header>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <CompanyTypeahead
          selected={selectedCompany}
          onSelectedChange={onCompanyChange}
          required
        />

        {/* Deal selector */}
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wide text-blue-900">
            Deal (optional)
          </span>
          {!selectedCompany ? (
            <p className="mt-1 text-xs text-blue-700/70">Pick a company first.</p>
          ) : dealsQuery.isLoading ? (
            <p className="mt-1 text-xs text-slate-500">Loading deals…</p>
          ) : dealsQuery.isError ? (
            <p className="mt-1 text-xs text-red-600">
              Failed to load deals
              {dealsQuery.error instanceof ApiError
                ? `: ${dealsQuery.error.message}`
                : "."}
            </p>
          ) : (
            <select
              value={selectedDealId}
              onChange={e => onDealIdChange(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
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
        </div>
      </div>
    </div>
  );
}
