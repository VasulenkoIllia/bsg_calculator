/**
 * Company detail page — header + deals table.
 *
 * Reuses the same loading / error envelope conventions as
 * CompaniesPage so an operator sees consistent failure modes
 * regardless of which screen they're on.
 *
 * The "amount" column intentionally renders the raw pg numeric()
 * string (e.g. "500000") rather than a localised currency: the
 * deal's own `currency` code lives alongside it, and we don't
 * want to invent rounding for amounts the operator may need to
 * cross-check against HubSpot exactly.
 */

import { Link, useParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import { useCompany, useCompanyDeals } from "../hooks/useCompany.js";
import type { PublicDeal } from "../api/types.js";
import { formatDate } from "../shared/format.js";

function formatAmount(deal: PublicDeal): string {
  if (!deal.amount) return "—";
  const currency = deal.currency ?? "";
  return currency ? `${deal.amount} ${currency}` : deal.amount;
}

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const companyQuery = useCompany(id);
  const deals = useCompanyDeals(id);

  const renderHeader = () => {
    if (companyQuery.isLoading) {
      return <p className="text-sm text-slate-500">Loading company…</p>;
    }
    if (companyQuery.isError) {
      const err = companyQuery.error;
      const msg = err instanceof ApiError ? err.message : "Unexpected error";
      return (
        <p className="text-sm text-red-600">Failed to load company: {msg}</p>
      );
    }
    const company = companyQuery.data;
    if (!company) {
      return <p className="text-sm text-slate-500">Company not found.</p>;
    }
    return (
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Company
        </p>
        <h1 className="text-xl font-semibold text-slate-900">{company.name}</h1>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm text-slate-600 sm:grid-cols-2 md:grid-cols-3">
          <div>
            <dt className="font-semibold text-slate-500">Segment</dt>
            <dd>{company.segmentType ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Lifecycle</dt>
            <dd>{company.lifecycleStage ?? "—"}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">HubSpot ID</dt>
            <dd className="font-mono text-xs">{company.hubspotCompanyId}</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-500">Last synced</dt>
            <dd>{formatDate(company.lastSyncedAt)}</dd>
          </div>
        </dl>
      </header>
    );
  };

  return (
    <section className="space-y-6">
      <Link
        to="/companies"
        className="inline-block text-sm font-semibold text-blue-700 hover:text-blue-900 hover:underline"
      >
        ← All companies
      </Link>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        {renderHeader()}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
            Deals
          </h2>
          <span className="text-xs text-slate-500">
            {deals.items.length} loaded{deals.hasNextPage ? "+" : ""}
          </span>
        </div>
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-white text-xs font-semibold uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left">Name</th>
              <th className="px-4 py-3 text-left">Stage</th>
              <th className="px-4 py-3 text-left">Vertical</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3 text-left">HubSpot updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {deals.isLoading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                  Loading deals…
                </td>
              </tr>
            ) : null}

            {deals.isError ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-red-600">
                  Failed to load deals
                  {deals.error instanceof ApiError ? `: ${deals.error.message}` : "."}
                </td>
              </tr>
            ) : null}

            {!deals.isLoading && !deals.isError && deals.items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
                  No deals associated with this company yet.
                </td>
              </tr>
            ) : null}

            {deals.items.map(deal => (
              <tr key={deal.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-medium text-slate-800">{deal.name}</td>
                <td className="px-4 py-3 text-slate-700">{deal.stage ?? "—"}</td>
                <td className="px-4 py-3 text-slate-700">{deal.businessVertical ?? "—"}</td>
                <td className="px-4 py-3 text-right font-mono text-slate-700">
                  {formatAmount(deal)}
                </td>
                <td className="px-4 py-3 text-slate-500">
                  {formatDate(deal.hubspotModifiedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {deals.hasNextPage ? (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => deals.fetchNextPage()}
            disabled={deals.isFetchingNextPage}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {deals.isFetchingNextPage ? "Loading…" : "Load more deals"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
