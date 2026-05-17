/**
 * Wizard backend bar — visible on every wizard step.
 *
 * Holds the "where does this document belong + what number will it
 * get" controls that operators need to choose UPFRONT, before they
 * spend 3 minutes filling the wizard. Moved out of the wizard step
 * tree on 2026-05-17 (Sprint 4.E revision) so:
 *   - Company / Deal picker lives at the top of /wizard from Step 1.
 *   - Document Number preview shows the BSG-XXXXX that will be
 *     allocated on save (via GET /numbering/peek). Real allocation
 *     happens inside the POST /documents TX and may differ if
 *     another save lands first — the preview is a hint, not a promise.
 *   - "Save document" button is the single explicit action that
 *     persists the wizard draft. Disabled until a company is picked.
 *
 * The bar is parent-controlled: every input value + setter is passed
 * in. WizardPage owns the state so the values survive step changes
 * (Wizard internals never re-mount this component on step navigation).
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../api/client.js";
import * as documentsApi from "../api/documents.js";
import { useCompanyDeals } from "../hooks/useCompany.js";
import { useCompanySearch } from "../hooks/useCompanySearch.js";
import type { PublicCompany } from "../api/types.js";

export interface WizardBackendBarProps {
  selectedCompany: PublicCompany | null;
  onCompanyChange: (company: PublicCompany | null) => void;
  selectedDealId: string;
  onDealIdChange: (dealId: string) => void;
  scopeLabel: string;
  onOpenSaveDialog: () => void;
}

export function WizardBackendBar({
  selectedCompany,
  onCompanyChange,
  selectedDealId,
  onDealIdChange,
  scopeLabel,
  onOpenSaveDialog
}: WizardBackendBarProps) {
  const [companyQuery, setCompanyQuery] = useState("");
  const companySearch = useCompanySearch(companyQuery);
  const dealsQuery = useCompanyDeals(selectedCompany?.id);

  // Preview the next BSG-XXXXX number. Refetched on focus so a
  // recently-saved document by another tab pushes the preview forward.
  const numberPeek = useQuery({
    queryKey: ["numbering", "peek"],
    queryFn: () => documentsApi.peekNextNumber(),
    staleTime: 10_000
  });

  // Clear the deal selection when the company changes — a deal of
  // company A can never belong to company B (backend would 422).
  useEffect(() => {
    onDealIdChange("");
  }, [selectedCompany?.id, onDealIdChange]);

  return (
    <section className="mb-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
      <header className="flex items-start justify-between">
        <div>
          <h2 className="text-sm font-semibold text-blue-900">
            Backend save target
          </h2>
          <p className="mt-1 text-xs text-blue-800">
            Pick the company (and optional deal) up-front; the
            document number is reserved by the backend on save.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenSaveDialog}
          disabled={!selectedCompany}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          title={
            selectedCompany
              ? "Save the current wizard draft as a backend document"
              : "Select a company first"
          }
        >
          Save document…
        </button>
      </header>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Company picker */}
        <div className="lg:col-span-2">
          <span className="block text-xs font-semibold uppercase tracking-wide text-blue-900">
            Company *
          </span>
          {selectedCompany ? (
            <div className="mt-1 flex items-center justify-between rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm">
              <span className="font-semibold text-blue-900">
                {selectedCompany.name}
              </span>
              <button
                type="button"
                onClick={() => onCompanyChange(null)}
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
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
              {companySearch.effectiveQuery.length >= 2 ? (
                <ul
                  role="listbox"
                  className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white text-sm shadow-sm"
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
                          onCompanyChange(c);
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

        {/* Number preview */}
        <div>
          <span className="block text-xs font-semibold uppercase tracking-wide text-blue-900">
            Document Number
          </span>
          <div className="mt-1 rounded-lg border border-blue-200 bg-white px-3 py-2 font-mono text-sm font-semibold text-blue-900">
            {numberPeek.isLoading ? (
              <span className="text-slate-400">…</span>
            ) : numberPeek.isError ? (
              <span className="text-red-600">unavailable</span>
            ) : (
              numberPeek.data?.next ?? "—"
            )}
          </div>
          <p className="mt-1 text-[10px] uppercase tracking-wide text-blue-700/70">
            Reserved on save · scope: {scopeLabel}
          </p>
        </div>
      </div>
    </section>
  );
}
