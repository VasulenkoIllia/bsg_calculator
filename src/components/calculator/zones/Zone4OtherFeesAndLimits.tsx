import {
  DEFAULT_3DS_FEE_CONFIG,
  formatAmount2,
  formatAmountInteger,
  formatVariableAmount,
  normalizePayoutMinimumFeePerTransaction,
  type CalculatorTypeSelection,
  type ContractSummarySettings,
  type FailedTrxChargingMode,
  type FailedTrxImpact,
  type MonthlyMinimumFeeImpact,
  type PayoutMinimumFeeImpact,
  type PayoutMinimumFeeMode,
  type PayinTrafficDerived,
  type PayoutTrafficDerived,
  type SettlementPeriod,
  type SettlementFeeImpact,
  type ThreeDsImpact
} from "../../../domain/calculator/index.js";
import {
  FormulaLine,
  MetricCard,
  MiniToggle,
  NumberField,
  ZoneSection,
  clampNumber,
  formatCount,
  formatInputNumber
} from "../index.js";
import type { ZoneSectionNavigation } from "../types.js";

export interface Zone4OtherFeesAndLimitsProps {
  expanded: boolean;
  onToggle: () => void;
  navigation?: ZoneSectionNavigation;
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
  contractSummarySettings: ContractSummarySettings;
  setContractSummaryField: <T extends keyof ContractSummarySettings>(
    field: T,
    value: ContractSummarySettings[T]
  ) => void;
}

export function Zone4OtherFeesAndLimits({
  expanded,
  onToggle,
  navigation,
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
  contractSummarySettings,
  setContractSummaryField
}: Zone4OtherFeesAndLimitsProps) {
  return (
        <ZoneSection
          id="zone4"
          title="Zone 4: Other Fees & Limits"
          subtitle="Configure additional revenue-affecting fees and contract summary settings."
          expanded={expanded}
          onToggle={onToggle}
          navigation={navigation}
          headerClassName="border-b border-slate-200 bg-gradient-to-r from-rose-50 to-orange-50 px-5 py-4 md:px-7"
          contentClassName="p-5 md:p-7"
        >
          <div className="grid gap-6">
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

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-lg font-bold text-slate-800">Contract Summary Only</h3>
              <p className="mt-1 text-xs text-slate-500">
                These parameters are shown in offer summary and do not affect Zone 5 profitability.
              </p>
              {calculatorType.payin ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h4 className="text-base font-bold text-slate-800">
                        Payin Minimum Fee
                      </h4>
                      <p className="mt-1 text-xs text-slate-500">
                        Contract summary only. Does not affect Zone 5 profitability.
                      </p>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                      <input
                        className="h-4 w-4 accent-blue-600"
                        type="checkbox"
                        checked={contractSummarySettings.payoutMinimumFeeMode === "byRegion"}
                        onChange={event =>
                          setContractSummaryField(
                            "payoutMinimumFeeMode",
                            (event.target.checked ? "byRegion" : "overall") as PayoutMinimumFeeMode
                          )
                        }
                      />
                      By region (EU / WW)
                    </label>
                  </div>

                  {contractSummarySettings.payoutMinimumFeeMode === "overall" ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <NumberField
                        label="Volume Threshold (M)"
                        value={contractSummarySettings.payoutMinimumFeeThresholdMillion}
                        onChange={value =>
                          setContractSummaryField(
                            "payoutMinimumFeeThresholdMillion",
                            Math.max(0, value)
                          )
                        }
                        min={0}
                        step={0.5}
                        helper="Contract wording: minimum fee applies up to this payin volume tier."
                      />
                      <NumberField
                        label="Minimum Transaction Fee (€)"
                        value={contractSummarySettings.payoutMinimumFeePerTransaction}
                        onChange={value =>
                          setContractSummaryField(
                            "payoutMinimumFeePerTransaction",
                            Math.max(0, value)
                          )
                        }
                        min={0}
                        step={0.01}
                        helper="Default from contract table: €1.00; above threshold is N/A."
                      />
                      <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 md:col-span-2">
                        Contract preview: ≤€
                        {formatInputNumber(
                          contractSummarySettings.payoutMinimumFeeThresholdMillion
                        )}
                        M: {formatVariableAmount(contractSummarySettings.payoutMinimumFeePerTransaction)} /
                        &gt;€
                        {formatInputNumber(
                          contractSummarySettings.payoutMinimumFeeThresholdMillion
                        )}
                        M: N/A
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-sm font-bold text-slate-800">EU</p>
                        <div className="mt-2 grid gap-3 md:grid-cols-2">
                          <NumberField
                            label="EU Volume Threshold (M)"
                            value={contractSummarySettings.payoutMinimumFeeEuThresholdMillion}
                            onChange={value =>
                              setContractSummaryField(
                                "payoutMinimumFeeEuThresholdMillion",
                                Math.max(0, value)
                              )
                            }
                            min={0}
                            step={0.5}
                          />
                          <NumberField
                            label="EU Minimum Transaction Fee (€)"
                            value={contractSummarySettings.payoutMinimumFeeEuPerTransaction}
                            onChange={value =>
                              setContractSummaryField(
                                "payoutMinimumFeeEuPerTransaction",
                                Math.max(0, value)
                              )
                            }
                            min={0}
                            step={0.01}
                          />
                        </div>
                        <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          EU preview: ≤€
                          {formatInputNumber(
                            contractSummarySettings.payoutMinimumFeeEuThresholdMillion
                          )}
                          M: {formatVariableAmount(
                            contractSummarySettings.payoutMinimumFeeEuPerTransaction
                          )} /
                          &gt;€
                          {formatInputNumber(
                            contractSummarySettings.payoutMinimumFeeEuThresholdMillion
                          )}
                          M: N/A
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-sm font-bold text-slate-800">WW</p>
                        <div className="mt-2 grid gap-3 md:grid-cols-2">
                          <NumberField
                            label="WW Volume Threshold (M)"
                            value={contractSummarySettings.payoutMinimumFeeWwThresholdMillion}
                            onChange={value =>
                              setContractSummaryField(
                                "payoutMinimumFeeWwThresholdMillion",
                                Math.max(0, value)
                              )
                            }
                            min={0}
                            step={0.5}
                          />
                          <NumberField
                            label="WW Minimum Transaction Fee (€)"
                            value={contractSummarySettings.payoutMinimumFeeWwPerTransaction}
                            onChange={value =>
                              setContractSummaryField(
                                "payoutMinimumFeeWwPerTransaction",
                                Math.max(0, value)
                              )
                            }
                            min={0}
                            step={0.01}
                          />
                        </div>
                        <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          WW preview: ≤€
                          {formatInputNumber(
                            contractSummarySettings.payoutMinimumFeeWwThresholdMillion
                          )}
                          M: {formatVariableAmount(
                            contractSummarySettings.payoutMinimumFeeWwPerTransaction
                          )} /
                          &gt;€
                          {formatInputNumber(
                            contractSummarySettings.payoutMinimumFeeWwThresholdMillion
                          )}
                          M: N/A
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <NumberField
                  label="Account Setup Fee (€, one-time)"
                  value={contractSummarySettings.accountSetupFee}
                  onChange={value => setContractSummaryField("accountSetupFee", Math.max(0, value))}
                  min={0}
                  step={100}
                />
                <NumberField
                  label="Refund Cost (€)"
                  value={contractSummarySettings.refundCost}
                  onChange={value => setContractSummaryField("refundCost", Math.max(10, value))}
                  min={10}
                  step={5}
                  helper="Minimum provider cost is €10. Do not set below €10."
                  helperTone="warning"
                />
                <NumberField
                  label="Dispute/Chargeback Cost (€)"
                  value={contractSummarySettings.disputeCost}
                  onChange={value => setContractSummaryField("disputeCost", Math.max(50, value))}
                  min={50}
                  step={5}
                  helper="Minimum provider cost is €50. Do not set below €50."
                  helperTone="warning"
                />
                <div>
                  <span className="field-label">Settlement Period</span>
                  <div className="flex flex-wrap gap-2">
                    {(["T+1", "T+2", "T+3", "T+4", "T+5"] as SettlementPeriod[]).map(period => (
                      <MiniToggle
                        key={`settlement-period-${period}`}
                        label={period}
                        selected={contractSummarySettings.settlementPeriod === period}
                        onSelect={() => setContractSummaryField("settlementPeriod", period)}
                        ariaLabel={`Settlement period ${period}`}
                      />
                    ))}
                  </div>
                </div>
                <NumberField
                  label="Min Collection Size (€)"
                  value={contractSummarySettings.collectionLimitMin}
                  onChange={value =>
                    setContractSummaryField("collectionLimitMin", Math.max(1, value))
                  }
                  min={1}
                  step={1}
                />
                <NumberField
                  label="Max Collection Size (€)"
                  value={contractSummarySettings.collectionLimitMax}
                  onChange={value =>
                    setContractSummaryField(
                      "collectionLimitMax",
                      Math.max(contractSummarySettings.collectionLimitMin, value)
                    )
                  }
                  min={contractSummarySettings.collectionLimitMin}
                  step={100}
                />
                <NumberField
                  label="Min Payout Size (€)"
                  value={contractSummarySettings.payoutLimitMin}
                  onChange={value => setContractSummaryField("payoutLimitMin", Math.max(0, value))}
                  min={0}
                  step={10}
                />
                <div className="space-y-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                    <input
                      className="h-4 w-4 accent-blue-600"
                      type="checkbox"
                      checked={contractSummarySettings.payoutLimitMax === null}
                      onChange={event =>
                        setContractSummaryField(
                          "payoutLimitMax",
                          event.target.checked
                            ? null
                            : (contractSummarySettings.payoutLimitMax ?? 1_000)
                        )
                      }
                    />
                    Max Payout Size N/A (Unlimited)
                  </label>
                  {contractSummarySettings.payoutLimitMax !== null ? (
                    <NumberField
                      label="Max Payout Size (€)"
                      value={contractSummarySettings.payoutLimitMax}
                      onChange={value =>
                        setContractSummaryField(
                          "payoutLimitMax",
                          Math.max(contractSummarySettings.payoutLimitMin, value)
                        )
                      }
                      min={contractSummarySettings.payoutLimitMin}
                      step={100}
                    />
                  ) : null}
                </div>
                <NumberField
                  label="Rolling Reserve (%)"
                  value={contractSummarySettings.rollingReservePercent}
                  onChange={value =>
                    setContractSummaryField("rollingReservePercent", clampNumber(value, 0, 25))
                  }
                  min={0}
                  max={25}
                  step={1}
                />
                <NumberField
                  label="Rolling Reserve Hold (days)"
                  value={contractSummarySettings.rollingReserveHoldDays}
                  onChange={value =>
                    setContractSummaryField("rollingReserveHoldDays", clampNumber(value, 30, 360))
                  }
                  min={30}
                  max={360}
                  step={30}
                />
                <div className="space-y-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                    <input
                      className="h-4 w-4 accent-blue-600"
                      type="checkbox"
                      checked={contractSummarySettings.rollingReserveCap === null}
                      onChange={event =>
                        setContractSummaryField(
                          "rollingReserveCap",
                          event.target.checked
                            ? null
                            : (contractSummarySettings.rollingReserveCap ?? 50_000)
                        )
                      }
                    />
                    Rolling Reserve Cap N/A
                  </label>
                  {contractSummarySettings.rollingReserveCap !== null ? (
                    <NumberField
                      label="Rolling Reserve Cap (€)"
                      value={contractSummarySettings.rollingReserveCap}
                      onChange={value =>
                        setContractSummaryField("rollingReserveCap", Math.max(0, value))
                      }
                      min={0}
                      step={1000}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </ZoneSection>

  );
}
