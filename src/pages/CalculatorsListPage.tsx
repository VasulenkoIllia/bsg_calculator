/**
 * Top-level "Saved Calculators" workspace tab — Sprint 6.6.
 *
 * Closes the discoverability gap flagged after Sprint 6.4: until
 * this page existed, the only path to a saved calc was
 * Companies → click company → Saved-calculators tab. That
 * required remembering which company a config was saved against,
 * and bookmarking /calc/:id directly was the only stable path.
 *
 * This page lists every calc-config the operator has access to,
 * with substring search on title and per-row company badge so the
 * operator can see at a glance which company each draft belongs to.
 * Companion to /documents (which already had a parallel listing
 * page since Sprint 4.D).
 *
 * Backend contract: `GET /api/v1/calculator-configs` with no
 * companyId — Sprint 6.6 relaxed the parameter from required to
 * optional for this exact use case. `q` is substring-on-title with
 * LIKE-escape on the server side.
 *
 * Each row's "Open →" link routes to /calc/:id, where the existing
 * /calc/:id edit-mode UX takes over (hydration + auto-save + the
 * SavedStatusBadge + DocumentsFromCalcSection history strip).
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { LoadMoreButton } from "../components/LoadMoreButton.js";
import { useCalculatorConfigs } from "../hooks/useCalculatorConfig.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import { formatDate } from "../shared/format.js";

export function CalculatorsListPage() {
  const [searchInput, setSearchInput] = useState("");
  // 300ms debounce on the title-substring query so a fast typist
  // doesn't fire a request per keystroke. Mirrors the pattern used
  // on /documents (DocumentsListPage) and the company-typeahead.
  const q = useDebouncedValue(searchInput, 300);

  const configs = useCalculatorConfigs({ q });

  return (
    <section className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Saved calculators</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every calculator draft you&apos;ve saved. Each is owned by a
            company; click <strong>Open →</strong> to keep editing it
            (auto-save) or to launch the wizard from it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="search"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Search by title…"
            aria-label="Search saved calculators by title"
            className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
          <Link
            to="/calculator"
            className="rounded-lg border border-blue-500 bg-blue-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            + New calculator
          </Link>
        </div>
      </header>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left">Title</th>
              <th className="px-4 py-3 text-left">Company</th>
              <th className="px-4 py-3 text-left">Deal pin</th>
              <th className="px-4 py-3 text-left">Updated</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {configs.isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                  Loading saved calculators…
                </td>
              </tr>
            ) : null}

            {configs.isError ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-red-600">
                  Failed to load calculators
                  {configs.error instanceof ApiError ? `: ${configs.error.message}` : "."}
                </td>
              </tr>
            ) : null}

            {!configs.isLoading && !configs.isError && configs.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                  {q.trim()
                    ? `No saved calculators match "${q.trim()}".`
                    : "No saved calculators yet. Open the calculator and click Save calculator to persist one."}
                </td>
              </tr>
            ) : null}

            {configs.items.map(cfg => (
              <tr key={cfg.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">
                  {cfg.title ?? <span className="text-slate-400">(untitled)</span>}
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {/*
                    The PublicCalculatorConfig DTO carries companyId
                    (UUID) but not the company NAME — that would require
                    a JOIN on the listing endpoint. For Sprint 6.6 we
                    surface the link instead: clicking the company UUID
                    chunk takes the operator to /companies/:id, where
                    the company header gives them the full context.
                  */}
                  <Link
                    to={`/companies/${cfg.companyId}`}
                    className="text-xs font-medium text-blue-700 hover:text-blue-900 hover:underline"
                  >
                    Open company →
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-700">
                  {cfg.hubspotDealId ? (
                    <span className="font-mono text-xs">{cfg.hubspotDealId}</span>
                  ) : (
                    <span className="text-slate-400">company-level</span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate-500">{formatDate(cfg.updatedAt)}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    to={`/calc/${cfg.id}`}
                    className="font-semibold text-blue-700 hover:text-blue-900 hover:underline"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <LoadMoreButton
        hasNextPage={configs.hasNextPage}
        isFetchingNextPage={configs.isFetchingNextPage}
        fetchNextPage={configs.fetchNextPage}
        label="Load more calculators"
      />
    </section>
  );
}
