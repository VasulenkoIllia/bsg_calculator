/**
 * Company detail page — header + 3-tab layout (Deals / Saved
 * Calculators / Documents).
 *
 * Sprint 6.4: extended from the original flat deals table into a
 * tabbed view so the operator can see — for one company — every
 * deal, every saved calculator config, and every persisted document
 * without round-tripping through global lists.
 *
 * Tab state is held in a `?tab=` URL search param so a deep link
 * (or page refresh) lands the operator on the same tab. Default
 * tab = "deals" preserves the pre-Sprint-6.4 behaviour for any
 * existing /companies/:id bookmarks.
 *
 * The "amount" column on the deals table renders the raw pg
 * numeric() string (e.g. "500000") rather than a localised currency:
 * the deal's own `currency` code lives alongside it, and we don't
 * want to invent rounding for amounts the operator may need to
 * cross-check against HubSpot exactly.
 */

import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiError } from "../api/client.js";
import type { CalculatorConfigSortField } from "../api/calculator-configs.js";
import type { CompanyDealSortField } from "../api/companies.js";
import type { DocumentSortField } from "../api/documents.js";
import { LoadMoreButton } from "../components/LoadMoreButton.js";
import { SortableTh, type SortDirection } from "../components/SortableTh.js";
import { DocumentOfferStatus } from "../components/OfferStatusBadge.js";
import { useCalculatorConfigs } from "../hooks/useCalculatorConfig.js";
import { useCompany, useCompanyDeals } from "../hooks/useCompany.js";
import { useDocuments } from "../hooks/useDocuments.js";
import { useSortState } from "../hooks/useSortState.js";
import type {
  PublicCalculatorConfig,
  PublicDeal,
  PublicDocument
} from "../api/types.js";
import { formatDateTime, formatScopeLabel } from "../shared/format.js";

/**
 * Sprint 7.2: each nested table on CompanyDetailPage owns its own
 * sort state. We pass the trio (field / direction / change handler)
 * down via a single typed object so the table components stay
 * presentational. Reused for all three tabs via a generic `TField`.
 */
interface SortControls<TField extends string> {
  field: TField;
  direction: SortDirection;
  onChange: (field: TField, direction: SortDirection) => void;
}

function formatAmount(deal: PublicDeal): string {
  if (!deal.amount) return "—";
  const currency = deal.currency ?? "";
  return currency ? `${deal.amount} ${currency}` : deal.amount;
}

type CompanyTab = "deals" | "calcs" | "documents";
const VALID_TABS: ReadonlyArray<CompanyTab> = ["deals", "calcs", "documents"];

function parseTab(value: string | null): CompanyTab {
  if (!value) return "deals";
  return VALID_TABS.find(t => t === value) ?? "deals";
}

export function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseTab(searchParams.get("tab"));
  const setActiveTab = (next: CompanyTab) => {
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  const companyQuery = useCompany(id);

  // All three tab queries are kicked off in parallel so switching
  // tabs feels instant. TanStack Query's `enabled` flag is left at
  // its default (true) — listing endpoints are cheap and the operator
  // is likely to switch tabs anyway. If this becomes a perf concern
  // for companies with hundreds of records, gate each query on
  // `activeTab === "<tab>"` so only the visible tab fires.
  // Sprint 7.2: per-tab sort state. Three independent useSortState
  // hooks keep each table's column-order memory separate — switching
  // tabs back and forth doesn't reset the operator's chosen sort.
  const dealsSort = useSortState<CompanyDealSortField>("createdAt", "desc");
  const calcsSort = useSortState<CalculatorConfigSortField>("createdAt", "desc");
  const docsSort = useSortState<DocumentSortField>("createdAt", "desc");

  const deals = useCompanyDeals(id, { sort: dealsSort.sortSpec });
  // Sprint 6.6: useCalculatorConfigs no longer gates on companyId
  // alone (that mode is now reserved for the top-level /calculators
  // discovery page). On CompanyDetailPage we only want the listing
  // once the route param has resolved — explicit `enabled` flag.
  const configs = useCalculatorConfigs({
    companyId: id,
    sort: calcsSort.sortSpec,
    enabled: typeof id === "string" && id.length > 0
  });
  const documents = useDocuments({ companyId: id, sort: docsSort.sortSpec });

  const dealsSortControls: SortControls<CompanyDealSortField> = {
    field: dealsSort.sortField,
    direction: dealsSort.sortDir,
    onChange: dealsSort.handleSortChange
  };
  const calcsSortControls: SortControls<CalculatorConfigSortField> = {
    field: calcsSort.sortField,
    direction: calcsSort.sortDir,
    onChange: calcsSort.handleSortChange
  };
  const docsSortControls: SortControls<DocumentSortField> = {
    field: docsSort.sortField,
    direction: docsSort.sortDir,
    onChange: docsSort.handleSortChange
  };

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
            <dd>{formatDateTime(company.lastSyncedAt)}</dd>
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
        <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-2">
          <TabButton
            label="Deals"
            count={deals.items.length}
            hasMore={deals.hasNextPage}
            active={activeTab === "deals"}
            onClick={() => setActiveTab("deals")}
          />
          <TabButton
            label="Saved calculators"
            count={configs.items.length}
            hasMore={configs.hasNextPage}
            active={activeTab === "calcs"}
            onClick={() => setActiveTab("calcs")}
          />
          <TabButton
            label="Documents"
            count={documents.items.length}
            hasMore={documents.hasNextPage}
            active={activeTab === "documents"}
            onClick={() => setActiveTab("documents")}
          />
        </div>

        {activeTab === "deals" ? (
          <DealsTable deals={deals} sort={dealsSortControls} />
        ) : null}
        {activeTab === "calcs" ? (
          <CalcsTable configs={configs} sort={calcsSortControls} />
        ) : null}
        {activeTab === "documents" ? (
          <DocumentsTable documents={documents} sort={docsSortControls} />
        ) : null}
      </div>

      {activeTab === "deals" ? (
        <LoadMoreButton
          hasNextPage={deals.hasNextPage}
          isFetchingNextPage={deals.isFetchingNextPage}
          fetchNextPage={deals.fetchNextPage}
          label="Load more deals"
        />
      ) : null}
      {activeTab === "calcs" ? (
        <LoadMoreButton
          hasNextPage={configs.hasNextPage}
          isFetchingNextPage={configs.isFetchingNextPage}
          fetchNextPage={configs.fetchNextPage}
          label="Load more calculators"
        />
      ) : null}
      {activeTab === "documents" ? (
        <LoadMoreButton
          hasNextPage={documents.hasNextPage}
          isFetchingNextPage={documents.isFetchingNextPage}
          fetchNextPage={documents.fetchNextPage}
          label="Load more documents"
        />
      ) : null}
    </section>
  );
}

function TabButton({
  label,
  count,
  hasMore,
  active,
  onClick
}: {
  label: string;
  count: number;
  hasMore: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
        active
          ? "bg-blue-600 text-white shadow-sm"
          : "bg-transparent text-slate-700 hover:bg-slate-200"
      }`}
    >
      <span>{label}</span>
      <span
        className={`rounded-full px-1.5 text-xs font-medium ${
          active ? "bg-blue-500/80 text-white" : "bg-slate-200 text-slate-600"
        }`}
      >
        {count}
        {hasMore ? "+" : ""}
      </span>
    </button>
  );
}

function DealsTable({
  deals,
  sort
}: {
  deals: ReturnType<typeof useCompanyDeals>;
  sort: SortControls<CompanyDealSortField>;
}) {
  return (
    <table className="min-w-full divide-y divide-slate-200 text-sm">
      <thead className="bg-white">
        <tr>
          <SortableTh
            field="name"
            activeField={sort.field}
            activeDirection={sort.direction}
            onSortChange={sort.onChange}
          >
            Name
          </SortableTh>
          <SortableTh
            field="stage"
            activeField={sort.field}
            activeDirection={sort.direction}
            onSortChange={sort.onChange}
          >
            Stage
          </SortableTh>
          <SortableTh
            field="businessVertical"
            activeField={sort.field}
            activeDirection={sort.direction}
            onSortChange={sort.onChange}
          >
            Vertical
          </SortableTh>
          <SortableTh
            field="amount"
            activeField={sort.field}
            activeDirection={sort.direction}
            onSortChange={sort.onChange}
            align="right"
          >
            Amount
          </SortableTh>
          <SortableTh
            field="hubspotModifiedAt"
            activeField={sort.field}
            activeDirection={sort.direction}
            onSortChange={sort.onChange}
          >
            HubSpot updated
          </SortableTh>
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
              {formatDateTime(deal.hubspotModifiedAt)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CalcsTable({
  configs,
  sort
}: {
  configs: ReturnType<typeof useCalculatorConfigs>;
  sort: SortControls<CalculatorConfigSortField>;
}) {
  return (
    <table className="min-w-full divide-y divide-slate-200 text-sm">
      <thead className="bg-white">
        <tr>
          <SortableTh
            field="title"
            activeField={sort.field}
            activeDirection={sort.direction}
            onSortChange={sort.onChange}
          >
            Title
          </SortableTh>
          <SortableTh
            field="hubspotDealId"
            activeField={sort.field}
            activeDirection={sort.direction}
            onSortChange={sort.onChange}
            tooltip="HubSpot deal ID if the draft is pinned to a specific deal, or 'company-level' if it's available to any deal of the parent company."
          >
            Deal
          </SortableTh>
          <SortableTh
            field="updatedAt"
            activeField={sort.field}
            activeDirection={sort.direction}
            onSortChange={sort.onChange}
          >
            Updated
          </SortableTh>
          {/* Actions column has no sortable header */}
          <th className="px-4 py-3" aria-label="Actions" />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {configs.isLoading ? (
          <tr>
            <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
              Loading saved calculators…
            </td>
          </tr>
        ) : null}

        {configs.isError ? (
          <tr>
            <td colSpan={4} className="px-4 py-6 text-center text-sm text-red-600">
              Failed to load calculators
              {configs.error instanceof ApiError ? `: ${configs.error.message}` : "."}
            </td>
          </tr>
        ) : null}

        {!configs.isLoading && !configs.isError && configs.items.length === 0 ? (
          <tr>
            <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-500">
              No saved calculators yet. Open the calculator and click
              <strong> Save calculator</strong> to persist one.
            </td>
          </tr>
        ) : null}

        {configs.items.map((cfg: PublicCalculatorConfig) => (
          <tr key={cfg.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-medium text-slate-800">
              {cfg.title ?? <span className="text-slate-400">(untitled)</span>}
            </td>
            <td className="px-4 py-3 text-slate-700">
              {cfg.hubspotDealId ? (
                <span className="font-mono text-xs">{cfg.hubspotDealId}</span>
              ) : (
                <span className="text-slate-400">company-level</span>
              )}
            </td>
            <td className="px-4 py-3 text-slate-500">{formatDateTime(cfg.updatedAt)}</td>
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
  );
}

function DocumentsTable({
  documents,
  sort
}: {
  documents: ReturnType<typeof useDocuments>;
  sort: SortControls<DocumentSortField>;
}) {
  return (
    <table className="min-w-full divide-y divide-slate-200 text-sm">
      <thead className="bg-white">
        <tr>
          <SortableTh
            field="number"
            activeField={sort.field}
            activeDirection={sort.direction}
            onSortChange={sort.onChange}
          >
            Number
          </SortableTh>
          <SortableTh
            field="scope"
            activeField={sort.field}
            activeDirection={sort.direction}
            onSortChange={sort.onChange}
          >
            Scope
          </SortableTh>
          <th className="px-4 py-3 text-left font-semibold text-slate-600">Validity</th>
          <SortableTh
            field="createdAt"
            activeField={sort.field}
            activeDirection={sort.direction}
            onSortChange={sort.onChange}
          >
            Created
          </SortableTh>
          <th className="px-4 py-3" aria-label="Actions" />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {documents.isLoading ? (
          <tr>
            <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
              Loading documents…
            </td>
          </tr>
        ) : null}

        {documents.isError ? (
          <tr>
            <td colSpan={5} className="px-4 py-6 text-center text-sm text-red-600">
              Failed to load documents
              {documents.error instanceof ApiError ? `: ${documents.error.message}` : "."}
            </td>
          </tr>
        ) : null}

        {!documents.isLoading && !documents.isError && documents.items.length === 0 ? (
          <tr>
            <td colSpan={5} className="px-4 py-6 text-center text-sm text-slate-500">
              No documents saved for this company yet. Use the wizard
              to create one.
            </td>
          </tr>
        ) : null}

        {documents.items.map((doc: PublicDocument) => (
          <tr key={doc.id} className="hover:bg-slate-50">
            <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-800">
              {doc.number}
            </td>
            <td className="px-4 py-3 text-slate-700">
              {formatScopeLabel(doc.scope)}
            </td>
            <td className="px-4 py-3">
              <DocumentOfferStatus scope={doc.scope} payload={doc.payload} />
            </td>
            <td className="px-4 py-3 text-slate-500">{formatDateTime(doc.createdAt)}</td>
            <td className="px-4 py-3 text-right">
              <Link
                to={`/documents/${doc.number}`}
                className="font-semibold text-blue-700 hover:text-blue-900 hover:underline"
              >
                Open →
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
