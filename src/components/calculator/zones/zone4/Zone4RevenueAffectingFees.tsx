import {
  DEFAULT_3DS_FEE_CONFIG,
  formatAmount2,
  formatAmountInteger,
  formatVariableAmount,
  normalizePayoutMinimumFeePerTransaction,
  type CalculatorTypeSelection,
  type FailedTrxChargingMode,
  type FailedTrxImpact,
  type MonthlyMinimumFeeImpact,
  type PayoutMinimumFeeImpact,
  type PayinTrafficDerived,
  type PayoutTrafficDerived,
  type SettlementFeeImpact,
  type ThreeDsImpact
} from "../../../../domain/calculator/index.js";
import {
  FormulaLine,
  MetricCard,
  MiniToggle,
  NumberField,
  clampNumber,
  formatCount,
  formatInputNumber
} from "../../index.js";

export interface Zone4RevenueAffectingFeesProps {
  calculatorType: CalculatorTypeSelection;
  payin: PayinTrafficDerived;
  payout: PayoutTrafficDerived;
  payoutMinimumFeeEnabled: boolean;
  setPayoutMinimumFeeEnabled: (value: boolean) => void;
  payoutMinimumFeePerTransaction: number;
  setPayoutMinimumFeePerTransaction: (value: number) => void;
  threeDsEnabled: boolean;
  setThreeDsEnabled: (value: boolean) => void;
  threeDsRevenuePerSuccessfulTransaction: number;
  setThreeDsRevenuePerSuccessfulTransaction: (value: number) => void;
  settlementIncluded: boolean;
  settlementFeeEnabled: boolean;
  setSettlementFeeEnabled: (value: boolean) => void;
  settlementFeeRatePercent: number;
  setSettlementFeeRatePercent: (value: number) => void;
  monthlyMinimumFeeEnabled: boolean;
  setMonthlyMinimumFeeEnabled: (value: boolean) => void;
  monthlyMinimumFeeAmount: number;
  setMonthlyMinimumFeeAmount: (value: number) => void;
  failedTrxEnabled: boolean;
  setFailedTrxEnabled: (value: boolean) => void;
  failedTrxMode: FailedTrxChargingMode;
  setFailedTrxMode: (value: FailedTrxChargingMode) => void;
  failedTrxOverLimitThresholdPercent: number;
  setFailedTrxOverLimitThresholdPercent: (value: number) => void;
  showZone4Formulas: boolean;
  payoutMinimumFeeImpact: PayoutMinimumFeeImpact;
  threeDsImpact: ThreeDsImpact;
  settlementFeeImpact: SettlementFeeImpact;
  monthlyMinimumFeeImpact: MonthlyMinimumFeeImpact;
  failedTrxImpact: FailedTrxImpact;
  effectiveFailedTrxFees: {
    ccFee: number;
    apmFee: number;
  };
  payinBaseRevenue: number;
  payoutRevenueAdjusted: number;
}

export function Zone4RevenueAffectingFees({
  calculatorType,
  payin,
  payout,
  payoutMinimumFeeEnabled,
  setPayoutMinimumFeeEnabled,
  payoutMinimumFeePerTransaction,
  setPayoutMinimumFeePerTransaction,
  threeDsEnabled,
  setThreeDsEnabled,
  threeDsRevenuePerSuccessfulTransaction,
  setThreeDsRevenuePerSuccessfulTransaction,
  settlementIncluded,
  settlementFeeEnabled,
  setSettlementFeeEnabled,
  settlementFeeRatePercent,
  setSettlementFeeRatePercent,
  monthlyMinimumFeeEnabled,
  setMonthlyMinimumFeeEnabled,
  monthlyMinimumFeeAmount,
  setMonthlyMinimumFeeAmount,
  failedTrxEnabled,
  setFailedTrxEnabled,
  failedTrxMode,
  setFailedTrxMode,
  failedTrxOverLimitThresholdPercent,
  setFailedTrxOverLimitThresholdPercent,
  showZone4Formulas,
  payoutMinimumFeeImpact,
  threeDsImpact,
  settlementFeeImpact,
  monthlyMinimumFeeImpact,
  failedTrxImpact,
  effectiveFailedTrxFees,
  payinBaseRevenue,
  payoutRevenueAdjusted,
}: Zone4RevenueAffectingFeesProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-bold text-slate-800">Revenue-Affecting Fees</h3>
      <div className="mt-4 grid gap-5">
        {calculatorType.payout ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              <input
                className="h-4 w-4 accent-blue-600"
                type="checkbox"
                checked={payoutMinimumFeeEnabled}
                onChange={event => setPayoutMinimumFeeEnabled(event.target.checked)}
              />
              Payout Minimum Fee (Per Transaction)
            </label>
            <div className="mt-3">
              <NumberField
                label="Minimum Fee per Transaction (€)"
                value={payoutMinimumFeePerTransaction}
                onChange={value =>
                  setPayoutMinimumFeePerTransaction(
                    normalizePayoutMinimumFeePerTransaction(value)
                  )
                }
                min={0}
                step={0.1}
                helper="Rounding rule: always round up to the next €0.10."
                helperTone="warning"
              />
            </div>
          </div>
        ) : null}

        {calculatorType.payin ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              <input
                className="h-4 w-4 accent-blue-600"
                type="checkbox"
                checked={threeDsEnabled}
                onChange={event => setThreeDsEnabled(event.target.checked)}
              />
              3D Secure Fee
            </label>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <NumberField
                label="3DS Revenue per Successful TRX (€)"
                value={threeDsRevenuePerSuccessfulTransaction}
                onChange={value =>
                  setThreeDsRevenuePerSuccessfulTransaction(Math.max(0, value))
                }
                min={0}
                step={0.01}
              />
              <NumberField
                label="Provider 3DS Cost per Attempt (€) - Always"
                value={DEFAULT_3DS_FEE_CONFIG.providerCostPerAttempt}
                onChange={() => undefined}
                readOnly
              />
            </div>
          </div>
        ) : null}

        {!settlementIncluded ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              <input
                className="h-4 w-4 accent-blue-600"
                type="checkbox"
                checked={settlementFeeEnabled}
                onChange={event => setSettlementFeeEnabled(event.target.checked)}
              />
              Settlement Fee
            </label>
            <div className="mt-3">
              <NumberField
                label="Settlement Rate (%)"
                value={settlementFeeRatePercent}
                onChange={value => setSettlementFeeRatePercent(clampNumber(value, 0, 2))}
                min={0}
                max={2}
                step={0.1}
                helper="Allowed range: 0.00% to 2.00%."
                helperTone="warning"
              />
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            Settlement Fee block is hidden because `Settlement Included` is ON in Zone 3.
          </div>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <input
              className="h-4 w-4 accent-blue-600"
              type="checkbox"
              checked={monthlyMinimumFeeEnabled}
              onChange={event => setMonthlyMinimumFeeEnabled(event.target.checked)}
            />
            Monthly Minimum Fee
          </label>
          <div className="mt-3">
            <NumberField
              label="Minimum Monthly Revenue (€)"
              value={monthlyMinimumFeeAmount}
              onChange={value => setMonthlyMinimumFeeAmount(Math.max(0, value))}
              min={0}
              step={100}
            />
          </div>
        </div>

        {calculatorType.payin ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              <input
                className="h-4 w-4 accent-blue-600"
                type="checkbox"
                checked={failedTrxEnabled}
                onChange={event => setFailedTrxEnabled(event.target.checked)}
              />
              Failed TRX Charging
            </label>
            <div className="mt-3 grid gap-3">
              <NumberField
                label="Approval Ratio (%) - Auto from Zone 1"
                value={payin.normalized.approvalRatioPercent}
                onChange={() => undefined}
                readOnly
              />
              <div>
                <span className="field-label">Charging Mode</span>
                <div className="flex flex-wrap gap-2">
                  <MiniToggle
                    label="Over Limit Only"
                    selected={failedTrxMode === "overLimitOnly"}
                    onSelect={() => setFailedTrxMode("overLimitOnly")}
                    ariaLabel="Failed TRX over limit only"
                  />
                  <MiniToggle
                    label="All Failed Volume"
                    selected={failedTrxMode === "allFailedVolume"}
                    onSelect={() => setFailedTrxMode("allFailedVolume")}
                    ariaLabel="Failed TRX all failed volume"
                  />
                </div>
              </div>
              {failedTrxMode === "overLimitOnly" ? (
                <NumberField
                  label="Over Limit Threshold (%)"
                  value={failedTrxOverLimitThresholdPercent}
                  onChange={value =>
                    setFailedTrxOverLimitThresholdPercent(
                      clampNumber(value, 50, 95)
                    )
                  }
                  min={50}
                  max={95}
                  step={5}
                  helper="Informational mode only. Allowed range: 50% to 95%; lower values reset to 50%."
                  helperTone="warning"
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {showZone4Formulas ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-base font-bold text-slate-800">Formula Breakdown (Zone 4)</h4>
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              name="Payout Base Per-TRX Revenue"
              value={formatVariableAmount(payoutMinimumFeeImpact.perTransactionRevenue)}
            />
            <MetricCard
              name="Payout Applied Per-TRX Revenue"
              value={formatVariableAmount(payoutMinimumFeeImpact.appliedPerTransactionRevenue)}
            />
            <MetricCard
              name="Payout Revenue After Min Fee"
              value={formatAmount2(payoutMinimumFeeImpact.adjustedRevenue)}
            />
            <MetricCard
              name="Payout Minimum Fee Uplift"
              value={formatAmount2(payoutMinimumFeeImpact.upliftRevenue)}
            />
            <MetricCard name="3DS Revenue" value={formatAmount2(threeDsImpact.revenue)} />
            <MetricCard name="3DS Cost" value={formatAmount2(threeDsImpact.cost)} />
            <MetricCard
              name="Settlement Fee"
              value={formatAmount2(settlementFeeImpact.fee)}
            />
            <MetricCard
              name="Monthly Minimum Fee Uplift"
              value={formatAmount2(monthlyMinimumFeeImpact.upliftRevenue)}
            />
            <MetricCard
              name="Failed TRX Revenue (Effective)"
              value={formatAmount2(failedTrxImpact.effectiveRevenue)}
            />
          </div>
          <div className="mt-3 space-y-2">
            {calculatorType.payout ? (
              <FormulaLine>
                Formula: Payout Minimum Per-TRX Revenue = Base Payout Revenue (
                {formatAmount2(payoutMinimumFeeImpact.baseRevenue)}) / Payout Transactions (
                {formatCount(payout.normalized.totalTransactions)}) ={" "}
                {formatVariableAmount(payoutMinimumFeeImpact.perTransactionRevenue)}
              </FormulaLine>
            ) : null}
            {calculatorType.payout ? (
              <FormulaLine>
                Formula: Payout Revenue After Min Fee = max(Base Payout Revenue (
                {formatAmount2(payoutMinimumFeeImpact.baseRevenue)}), Minimum Fee per TRX (
                {formatVariableAmount(payoutMinimumFeePerTransaction)}) × Payout Transactions (
                {formatCount(payout.normalized.totalTransactions)})) ={" "}
                {formatAmount2(payoutMinimumFeeImpact.adjustedRevenue)}
              </FormulaLine>
            ) : null}
            {calculatorType.payout ? (
              <FormulaLine>
                Formula: Payout Minimum Fee Uplift = max(0, Applied Revenue (
                {formatAmount2(payoutMinimumFeeImpact.adjustedRevenue)}) - Base Payout Revenue (
                {formatAmount2(payoutMinimumFeeImpact.baseRevenue)})) ={" "}
                {formatAmount2(payoutMinimumFeeImpact.upliftRevenue)}
              </FormulaLine>
            ) : null}
            {calculatorType.payin ? (
              <FormulaLine>
                Formula: 3DS Revenue = Successful Payin Transactions (
                {formatCount(threeDsImpact.successfulTransactions)}) × 3DS Revenue per Successful (
                {formatVariableAmount(threeDsRevenuePerSuccessfulTransaction)}) (if enabled) ={" "}
                {formatAmount2(threeDsImpact.revenue)}
              </FormulaLine>
            ) : null}
            {calculatorType.payin ? (
              <FormulaLine>
                Formula: 3DS Cost = Total Payin Attempts ({formatCount(payin.attempts.total)}) ×
                Provider 3DS Cost per Attempt ({formatVariableAmount(
                  DEFAULT_3DS_FEE_CONFIG.providerCostPerAttempt
                )}) (always) ={" "}
                {formatAmount2(threeDsImpact.cost)}
              </FormulaLine>
            ) : null}
            {!settlementIncluded ? (
              <FormulaLine>
                Formula: Settlement Net = (Payin Volume (
                {formatAmountInteger(calculatorType.payin ? payin.normalized.monthlyVolume : 0)}
                ) - Payout Volume (
                {formatAmountInteger(calculatorType.payout ? payout.normalized.monthlyVolume : 0)}
                )) - (Payin Fees ALL ({formatAmount2(payinBaseRevenue + threeDsImpact.revenue)})
                + Payout Fees ALL ({formatAmount2(payoutRevenueAdjusted)})) ={" "}
                {formatAmount2(settlementFeeImpact.baseNet)}
              </FormulaLine>
            ) : null}
            {!settlementIncluded ? (
              <FormulaLine>
                {settlementFeeEnabled
                  ? `Formula: Settlement Fee = Chargeable Net (${formatAmount2(
                      settlementFeeImpact.chargeableNet
                    )}) × Rate (${formatInputNumber(
                      settlementFeeRatePercent
                    )}%) = ${formatAmount2(settlementFeeImpact.fee)}`
                  : `Formula: Settlement Fee = €0 because Settlement Fee toggle is OFF (reference if enabled: Chargeable Net ${formatAmount2(
                      settlementFeeImpact.chargeableNet
                    )} × Rate ${formatInputNumber(
                      settlementFeeRatePercent
                    )}% = ${formatAmount2(
                      settlementFeeImpact.chargeableNet *
                        (settlementFeeRatePercent / 100)
                    )})`}
              </FormulaLine>
            ) : null}
            <FormulaLine>
              Formula: Monthly Minimum Uplift = max(0, Minimum Monthly Revenue (
              {formatAmount2(monthlyMinimumFeeAmount)}) - Actual Revenue (
              {formatAmount2(monthlyMinimumFeeImpact.baseRevenue)})) ={" "}
              {formatAmount2(monthlyMinimumFeeImpact.upliftRevenue)}
            </FormulaLine>
            {calculatorType.payin ? (
              <FormulaLine>
                Formula: Failed TRX All-Failed Revenue = Failed CC (
                {formatCount(failedTrxImpact.failedCcTransactions)}) × CC TRX fee (
                {formatVariableAmount(effectiveFailedTrxFees.ccFee)}) + Failed APM (
                {formatCount(failedTrxImpact.failedApmTransactions)}) × APM TRX fee (
                {formatVariableAmount(effectiveFailedTrxFees.apmFee)}) ={" "}
                {formatAmount2(failedTrxImpact.allFailedRevenue)}
              </FormulaLine>
            ) : null}
            {calculatorType.payin && failedTrxMode === "overLimitOnly" ? (
              <FormulaLine>
                Formula: Over-Limit Attempts = max(0, Successful (
                {formatCount(payin.successful.total)}) / Threshold (
                {formatInputNumber(failedTrxOverLimitThresholdPercent)}%) - Actual Attempts (
                {formatCount(payin.attempts.total)})) ={" "}
                {formatCount(failedTrxImpact.overLimitAttempts)}
              </FormulaLine>
            ) : null}
          </div>
        {payoutMinimumFeeImpact.warning ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {payoutMinimumFeeImpact.warning}
          </p>
        ) : null}
        {monthlyMinimumFeeImpact.warning ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {monthlyMinimumFeeImpact.warning}
          </p>
        ) : null}
        {calculatorType.payin && failedTrxMode === "overLimitOnly" && failedTrxEnabled ? (
          <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
            Over Limit Only is informational and does not affect profitability totals.
          </p>
        ) : null}
        </div>
      ) : null}
    </div>
  );
}
