import {
  PAYOUT_MDR_MIN_PERCENT,
  PAYOUT_TRX_MIN_FEE,
  formatAmount2,
  formatAmountInteger,
  formatVariableAmount,
  type PayoutPricingConfig,
  type PayoutPricingPreview,
  type PayoutRateMinimumAdjustment,
  type PricingRateMode,
  type PayoutTrafficDerived,
} from "../../../../domain/calculator/index.js";
import { FormulaLine, MetricCard, MiniToggle, NumberField, formatCount, formatInputNumber } from "../../index.js";

export interface PayoutPricingPanelProps {
  payout: PayoutTrafficDerived;
  pricing: PayoutPricingConfig;
  preview: PayoutPricingPreview;
  rateMinimumAdjustments: PayoutRateMinimumAdjustment[];
  singleRateMinimumAdjustment: PayoutRateMinimumAdjustment | null;
  showFormulas: boolean;
  setRateMode: (rateMode: PricingRateMode) => void;
  setSingleField: (field: "mdrPercent" | "trxFee", value: number) => void;
  setTierField: (tierIndex: 0 | 1 | 2, field: "mdrPercent" | "trxFee", value: number) => void;
  setTierBoundary: (boundary: "tier1UpToMillion" | "tier2UpToMillion", value: number) => void;
}

export function PayoutPricingPanel({
  payout,
  pricing,
  preview,
  rateMinimumAdjustments,
  singleRateMinimumAdjustment,
  showFormulas,
  setRateMode,
  setSingleField,
  setTierField,
  setTierBoundary,
}: PayoutPricingPanelProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-bold text-slate-800">Payout Pricing</h3>
      <p className="mt-1 text-xs text-slate-500">
        Input basis: payout volume {formatAmountInteger(payout.normalized.monthlyVolume)},
        payout transactions {formatCount(payout.normalized.totalTransactions)}.
      </p>
      <div className="mt-4 grid gap-3">
        <div>
          <span className="field-label">Rate Type</span>
          <div className="flex flex-wrap gap-2">
            <MiniToggle
              label="Single Rate"
              selected={pricing.rateMode === "single"}
              onSelect={() => setRateMode("single")}
              ariaLabel="Payout single rate"
            />
            <MiniToggle
              label="Tiered Rates"
              selected={pricing.rateMode === "tiered"}
              onSelect={() => setRateMode("tiered")}
              ariaLabel="Payout tiered rates"
            />
          </div>
        </div>
        {pricing.rateMode === "single" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <NumberField
              label="MDR (%)"
              value={pricing.single.mdrPercent}
              onChange={value => setSingleField("mdrPercent", value)}
              min={0}
              max={5}
              step={0.05}
              helper={
                singleRateMinimumAdjustment?.mdrMinimumApplied
                  ? `Configured ${formatInputNumber(
                      singleRateMinimumAdjustment.configuredMdrPercent
                    )}% -> Applied ${formatInputNumber(
                      singleRateMinimumAdjustment.appliedMdrPercent
                    )}% (minimum floor).`
                  : undefined
              }
              helperTone="warning"
            />
            <NumberField
              label="TRX Fee (€)"
              value={pricing.single.trxFee}
              onChange={value => setSingleField("trxFee", value)}
              min={0}
              step={0.01}
              helper={
                singleRateMinimumAdjustment?.trxMinimumApplied
                  ? `Configured ${formatVariableAmount(
                      singleRateMinimumAdjustment.configuredTrxFee
                    )} -> Applied ${formatVariableAmount(
                      singleRateMinimumAdjustment.appliedTrxFee
                    )} (minimum floor).`
                  : undefined
              }
              helperTone="warning"
            />
          </div>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-3 md:grid-cols-2">
              <NumberField
                label="Tier 1 Up To (M)"
                value={pricing.tier1UpToMillion}
                onChange={value => setTierBoundary("tier1UpToMillion", value)}
                min={0}
                max={25}
                step={1}
              />
              <NumberField
                label="Tier 2 Up To (M)"
                value={pricing.tier2UpToMillion}
                onChange={value => setTierBoundary("tier2UpToMillion", value)}
                min={pricing.tier1UpToMillion}
                max={25}
                step={1}
              />
            </div>
            {pricing.tiers.map((tier, index) => (
              <div
                key={`payout-tier-${index}`}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                <p className="text-sm font-bold text-slate-700">Tier {index + 1}</p>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <NumberField
                    label="MDR (%)"
                    value={tier.mdrPercent}
                    onChange={value =>
                      setTierField(index as 0 | 1 | 2, "mdrPercent", value)
                    }
                    min={0}
                    max={5}
                    step={0.05}
                    helper={
                      preview.minimumAdjustments[index]?.mdrMinimumApplied
                        ? `Configured ${formatInputNumber(
                            preview.minimumAdjustments[index].configuredMdrPercent
                          )}% -> Applied ${formatInputNumber(
                            preview.minimumAdjustments[index].appliedMdrPercent
                          )}% (minimum floor).`
                        : undefined
                    }
                    helperTone="warning"
                  />
                  <NumberField
                    label="TRX Fee (€)"
                    value={tier.trxFee}
                    onChange={value =>
                      setTierField(index as 0 | 1 | 2, "trxFee", value)
                    }
                    min={0}
                    step={0.01}
                    helper={
                      preview.minimumAdjustments[index]?.trxMinimumApplied
                        ? `Configured ${formatVariableAmount(
                            preview.minimumAdjustments[index].configuredTrxFee
                          )} -> Applied ${formatVariableAmount(
                            preview.minimumAdjustments[index].appliedTrxFee
                          )} (minimum floor).`
                        : undefined
                    }
                    helperTone="warning"
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        {preview.warnings.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            {preview.warnings.map(warning => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        ) : null}
        {rateMinimumAdjustments.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-bold">Minimum floors applied in payout calculations:</p>
            {rateMinimumAdjustments.map(adjustment => (
              <p key={`payout-floor-${adjustment.scopeLabel}`}>
                {adjustment.scopeLabel}:{" "}
                {adjustment.mdrMinimumApplied
                  ? `MDR ${formatInputNumber(
                      adjustment.configuredMdrPercent
                    )}% -> ${formatInputNumber(adjustment.appliedMdrPercent)}%`
                  : `MDR ${formatInputNumber(adjustment.appliedMdrPercent)}%`}{" "}
                |{" "}
                {adjustment.trxMinimumApplied
                  ? `TRX ${formatVariableAmount(
                      adjustment.configuredTrxFee
                    )} -> ${formatVariableAmount(adjustment.appliedTrxFee)}`
                  : `TRX ${formatVariableAmount(adjustment.appliedTrxFee)}`}
              </p>
            ))}
          </div>
        ) : null}
      </div>

      {showFormulas ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-base font-bold text-slate-800">Formula Breakdown (Payout)</h4>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <MetricCard name="MDR Revenue" value={formatAmount2(preview.mdrRevenue)} />
            <MetricCard name="TRX Revenue" value={formatAmount2(preview.trxRevenue)} />
            <MetricCard name="Total Revenue" value={formatAmount2(preview.totalRevenue)} />
          </div>
          <div className="mt-3 space-y-2">
            {pricing.rateMode === "single" ? (
              <>
                <FormulaLine>
                  Formula: MDR Revenue = Monthly Payout Volume (
                  {formatAmountInteger(payout.normalized.monthlyVolume)}) × MDR (
                  {formatInputNumber(
                    singleRateMinimumAdjustment?.appliedMdrPercent ??
                      pricing.single.mdrPercent
                  )}
                  %) ={" "}
                  {formatAmount2(
                    payout.normalized.monthlyVolume *
                      ((singleRateMinimumAdjustment?.appliedMdrPercent ??
                        pricing.single.mdrPercent) /
                        100)
                  )}
                </FormulaLine>
                {singleRateMinimumAdjustment?.mdrMinimumApplied ? (
                  <FormulaLine className="border-amber-300 bg-amber-50 text-amber-900">
                    Minimum MDR floor applied: configured{" "}
                    {formatInputNumber(singleRateMinimumAdjustment.configuredMdrPercent)}%{" "}
                    {"->"} used in calculation{" "}
                    {formatInputNumber(singleRateMinimumAdjustment.appliedMdrPercent)}% (
                    min {formatInputNumber(PAYOUT_MDR_MIN_PERCENT)}%).
                  </FormulaLine>
                ) : null}
                <FormulaLine>
                  Formula: TRX Revenue = Payout Transactions (
                  {formatCount(payout.normalized.totalTransactions)}) × TRX Fee (
                  {formatVariableAmount(
                    singleRateMinimumAdjustment?.appliedTrxFee ??
                      pricing.single.trxFee
                  )}
                  ) ={" "}
                  {formatAmount2(preview.trxRevenue)}
                </FormulaLine>
                {singleRateMinimumAdjustment?.trxMinimumApplied ? (
                  <FormulaLine className="border-amber-300 bg-amber-50 text-amber-900">
                    Minimum TRX floor applied: configured{" "}
                    {formatVariableAmount(
                      singleRateMinimumAdjustment.configuredTrxFee
                    )}{" "}
                    {"->"} used in calculation{" "}
                    {formatVariableAmount(
                      singleRateMinimumAdjustment.appliedTrxFee
                    )}{" "}
                    (min {formatVariableAmount(PAYOUT_TRX_MIN_FEE)}).
                  </FormulaLine>
                ) : null}
              </>
            ) : (
              <>
                {preview.tierRows.map(row => (
                  <FormulaLine key={`payout-breakdown-${row.label}`}>
                    {row.label}: Volume {formatAmountInteger(row.volume)} × MDR{" "}
                    {formatInputNumber(row.appliedMdrPercent)}%
                    {row.mdrMinimumApplied
                      ? ` (configured ${formatInputNumber(
                          row.configuredMdrPercent
                        )}% -> minimum ${formatInputNumber(row.appliedMdrPercent)}%)`
                      : ""}{" "}
                    = {formatAmount2(row.mdrRevenue)}; TRX = {formatInputNumber(
                      row.transactions
                    )} trx × {formatVariableAmount(row.appliedTrxFee)}
                    {row.trxMinimumApplied
                      ? ` (configured ${formatVariableAmount(
                          row.configuredTrxFee
                        )} -> minimum ${formatVariableAmount(row.appliedTrxFee)})`
                      : ""}{" "}
                    ={" "}
                    {formatAmount2(row.trxRevenue)}
                  </FormulaLine>
                ))}
              </>
            )}
            <FormulaLine>
              Formula: Total Revenue = MDR Revenue ({formatAmount2(preview.mdrRevenue)}) +
              TRX Revenue ({formatAmount2(preview.trxRevenue)}) ={" "}
              {formatAmount2(preview.totalRevenue)}
            </FormulaLine>
          </div>
        </div>
      ) : null}
    </div>
  );
}
