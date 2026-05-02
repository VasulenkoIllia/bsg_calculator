import {
  formatAmount2,
  formatVariableAmount,
  type PayoutRateMinimumAdjustment
} from "../../../domain/calculator/index.js";
import {
  formatInputNumber,
  UnifiedProfitabilityRow,
  ZoneSection
} from "../index.js";
import type { UnifiedProfitabilityNode, ZoneSectionNavigation } from "../types.js";

export interface Zone5ProfitabilityCalculationsProps {
  expanded: boolean;
  onToggle: () => void;
  navigation?: ZoneSectionNavigation;
  showUnifiedFormulas: boolean;
  onShowUnifiedFormulasChange: (checked: boolean) => void;
  onExpandAllRows: () => void;
  onCollapseAllRows: () => void;
  unifiedProfitabilityTree: UnifiedProfitabilityNode[];
  unifiedExpandedById: Record<string, boolean>;
  onToggleUnifiedRow: (id: string) => void;
  payoutMinimumFeeWarning: string | null;
  payoutPerTransactionRevenue: number;
  payoutAppliedPerTransactionRevenue: number;
  payoutBaseRevenue: number;
  payoutAdjustedRevenue: number;
  payoutMinimumFeePerTransaction: number;
  monthlyMinimumWarning: string | null;
  monthlyMinimumBaseRevenue: number;
  monthlyMinimumAppliedRevenue: number;
  monthlyMinimumFeeAmount: number;
  monthlyMinimumUpliftRevenue: number;
  payoutRateMinimumAdjustments: PayoutRateMinimumAdjustment[];
}

export function Zone5ProfitabilityCalculations({
  expanded,
  onToggle,
  navigation,
  showUnifiedFormulas,
  onShowUnifiedFormulasChange,
  onExpandAllRows,
  onCollapseAllRows,
  unifiedProfitabilityTree,
  unifiedExpandedById,
  onToggleUnifiedRow,
  payoutMinimumFeeWarning,
  payoutPerTransactionRevenue,
  payoutAppliedPerTransactionRevenue,
  payoutBaseRevenue,
  payoutAdjustedRevenue,
  payoutMinimumFeePerTransaction,
  monthlyMinimumWarning,
  monthlyMinimumBaseRevenue,
  monthlyMinimumAppliedRevenue,
  monthlyMinimumFeeAmount,
  monthlyMinimumUpliftRevenue,
  payoutRateMinimumAdjustments
}: Zone5ProfitabilityCalculationsProps) {
  return (
    <ZoneSection
      id="zone5"
      title="Zone 5: Profitability Calculations"
      subtitle="Full profitability model with Payin/Payout/Other categories and total margin."
      expanded={expanded}
      onToggle={onToggle}
      navigation={navigation}
      headerClassName="border-b border-slate-200 bg-gradient-to-r from-cyan-50 to-blue-50 px-5 py-4 md:px-7"
      contentClassName="p-5 md:p-7"
    >
      <div className="grid gap-6">
        <div className="rounded-xl border border-blue-200 bg-white p-4">
          <h3 className="text-lg font-bold text-blue-700">Profitability Calculations</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onExpandAllRows}
                className="rounded-lg border border-blue-500 bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                aria-label="Expand all unified profitability rows"
              >
                Expand All
              </button>
              <button
                type="button"
                onClick={onCollapseAllRows}
                className="rounded-lg border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                aria-label="Collapse all unified profitability rows"
              >
                Collapse All
              </button>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-slate-800 md:justify-self-end">
              <input
                className="h-4 w-4 accent-blue-600"
                type="checkbox"
                aria-label="Show Formulas"
                checked={showUnifiedFormulas}
                onChange={event => onShowUnifiedFormulasChange(event.target.checked)}
              />
              Show Formulas
            </label>
          </div>
          {payoutMinimumFeeWarning || monthlyMinimumWarning ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {payoutMinimumFeeWarning ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="text-sm font-extrabold">Minimum Fee Applied: Payout</p>
                  <p className="mt-1">
                    Base per-TRX fee from pricing:{" "}
                    <strong>{formatVariableAmount(payoutPerTransactionRevenue)}</strong>
                  </p>
                  <p>
                    Configured minimum per-TRX fee:{" "}
                    <strong>{formatVariableAmount(payoutMinimumFeePerTransaction)}</strong>
                  </p>
                  <p>
                    Used in totals (per-TRX):{" "}
                    <strong>{formatVariableAmount(payoutAppliedPerTransactionRevenue)}</strong>
                  </p>
                  <p className="mt-1">
                    Base payout revenue: <strong>{formatAmount2(payoutBaseRevenue)}</strong>
                  </p>
                  <p>
                    Used in totals (payout revenue): <strong>{formatAmount2(payoutAdjustedRevenue)}</strong>
                  </p>
                  <p>
                    Difference from minimum rule: <strong>+{formatAmount2(payoutAdjustedRevenue - payoutBaseRevenue)}</strong>
                  </p>
                </div>
              ) : null}
              {monthlyMinimumWarning ? (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="text-sm font-extrabold">Minimum Fee Applied: Monthly</p>
                  <p className="mt-1">
                    Base actual revenue: <strong>{formatAmount2(monthlyMinimumBaseRevenue)}</strong>
                  </p>
                  <p>
                    Configured monthly minimum: <strong>{formatAmount2(monthlyMinimumFeeAmount)}</strong>
                  </p>
                  <p>
                    Used in totals (applied monthly revenue):{" "}
                    <strong>{formatAmount2(monthlyMinimumAppliedRevenue)}</strong>
                  </p>
                  <p>
                    Difference from minimum rule: <strong>+{formatAmount2(monthlyMinimumUpliftRevenue)}</strong>
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            {unifiedProfitabilityTree.map(node => (
              <UnifiedProfitabilityRow
                key={node.id}
                node={node}
                level={0}
                expandedById={unifiedExpandedById}
                onToggle={onToggleUnifiedRow}
                showFormulas={showUnifiedFormulas}
              />
            ))}
          </div>
        </div>

        {payoutMinimumFeeWarning ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {payoutMinimumFeeWarning} Used in totals: per-TRX fee{" "}
            {formatVariableAmount(payoutPerTransactionRevenue)} →{" "}
            {formatVariableAmount(payoutAppliedPerTransactionRevenue)}; payout revenue{" "}
            {formatAmount2(payoutBaseRevenue)} → {formatAmount2(payoutAdjustedRevenue)}.
          </p>
        ) : null}
        {monthlyMinimumWarning ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {monthlyMinimumWarning} Used in totals: actual revenue{" "}
            {formatAmount2(monthlyMinimumBaseRevenue)} → applied monthly revenue{" "}
            {formatAmount2(monthlyMinimumAppliedRevenue)} (minimum target{" "}
            {formatAmount2(monthlyMinimumFeeAmount)}).
          </p>
        ) : null}
        {payoutRateMinimumAdjustments.length > 0 ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Zone 3 payout minimum pricing floors used in totals:{" "}
            {payoutRateMinimumAdjustments
              .map(adjustment => {
                const mdrPart = adjustment.mdrMinimumApplied
                  ? `MDR ${formatInputNumber(adjustment.configuredMdrPercent)}% → ${formatInputNumber(
                      adjustment.appliedMdrPercent
                    )}%`
                  : `MDR ${formatInputNumber(adjustment.appliedMdrPercent)}%`;
                const trxPart = adjustment.trxMinimumApplied
                  ? `TRX ${formatVariableAmount(adjustment.configuredTrxFee)} → ${formatVariableAmount(
                      adjustment.appliedTrxFee
                    )}`
                  : `TRX ${formatVariableAmount(adjustment.appliedTrxFee)}`;
                return `${adjustment.scopeLabel}: ${mdrPart}, ${trxPart}`;
              })
              .join(" | ")}
            .
          </p>
        ) : null}
      </div>
    </ZoneSection>
  );
}
