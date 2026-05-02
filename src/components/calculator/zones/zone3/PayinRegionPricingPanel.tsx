import {
  formatAmount2,
  formatAmountInteger,
  formatVariableAmount,
  type PayinRegionPricingConfig,
  type PayinRegionPricingPreview,
  type PricingModelType,
  type PricingRateMode,
  type PayinTrafficDerived,
} from "../../../../domain/calculator/index.js";
import { FormulaLine, MetricCard, MiniToggle, NumberField, formatCount, formatInputNumber } from "../../index.js";

export interface PayinRegionPricingPanelProps {
  region: "eu" | "ww";
  regionLabel: string;
  pricing: PayinRegionPricingConfig;
  preview: PayinRegionPricingPreview;
  payin: PayinTrafficDerived;
  showFormulas: boolean;
  setModel: (model: PricingModelType) => void;
  setRateMode: (rateMode: PricingRateMode) => void;
  setTrxEnabled: (enabled: boolean) => void;
  setSingleField: (field: "mdrPercent" | "trxCc" | "trxApm", value: number) => void;
  setTierField: (tierIndex: 0 | 1 | 2, field: "mdrPercent" | "trxCc" | "trxApm", value: number) => void;
  setTierBoundary: (boundary: "tier1UpToMillion" | "tier2UpToMillion", value: number) => void;
}

export function PayinRegionPricingPanel({
  region,
  regionLabel,
  pricing,
  preview,
  payin,
  showFormulas,
  setModel,
  setRateMode,
  setTrxEnabled,
  setSingleField,
  setTierField,
  setTierBoundary,
}: PayinRegionPricingPanelProps) {
  const volume = region === "eu" ? payin.volume.eu : payin.volume.ww;
  const successfulCc = region === "eu" ? payin.successful.byRegionMethod.euCc : payin.successful.byRegionMethod.wwCc;
  const successfulApm = region === "eu" ? payin.successful.byRegionMethod.euApm : payin.successful.byRegionMethod.wwApm;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-bold text-slate-800">Payin {regionLabel} Pricing</h3>
      <p className="mt-1 text-xs text-slate-500">
        Input basis: {regionLabel} volume {formatAmountInteger(volume)}, successful {regionLabel}
        CC/APM {formatCount(successfulCc)} /{" "}
        {formatCount(successfulApm)}.
      </p>
      <div className="mt-4 grid gap-3">
        <div>
          <span className="field-label">Pricing Model</span>
          <div className="flex flex-wrap gap-2">
            <MiniToggle
              label="IC++"
              selected={pricing.model === "icpp"}
              onSelect={() => setModel("icpp")}
              ariaLabel={`Payin ${regionLabel} model IC++`}
            />
            <MiniToggle
              label="Blended"
              selected={pricing.model === "blended"}
              onSelect={() => setModel("blended")}
              ariaLabel={`Payin ${regionLabel} model Blended`}
            />
          </div>
        </div>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
          <input
            className="h-4 w-4 accent-blue-600"
            type="checkbox"
            checked={pricing.trxFeeEnabled}
            onChange={event => setTrxEnabled(event.target.checked)}
          />
          TRX Fee Enabled
        </label>
        <div>
          <span className="field-label">Rate Type</span>
          <div className="flex flex-wrap gap-2">
            <MiniToggle
              label="Single Rate"
              selected={pricing.rateMode === "single"}
              onSelect={() => setRateMode("single")}
              ariaLabel={`Payin ${regionLabel} single rate`}
            />
            <MiniToggle
              label="Tiered Rates"
              selected={pricing.rateMode === "tiered"}
              onSelect={() => setRateMode("tiered")}
              ariaLabel={`Payin ${regionLabel} tiered rates`}
            />
          </div>
        </div>
        {pricing.rateMode === "single" ? (
          <div className="grid gap-3 md:grid-cols-3">
            <NumberField
              label="MDR (%)"
              value={pricing.single.mdrPercent}
              onChange={value => setSingleField("mdrPercent", value)}
              min={0}
              max={10}
              step={0.05}
            />
            <NumberField
              label="TRX CC (€)"
              value={pricing.single.trxCc}
              onChange={value => setSingleField("trxCc", value)}
              min={0}
              step={0.01}
            />
            <NumberField
              label="TRX APM (€)"
              value={pricing.single.trxApm}
              onChange={value => setSingleField("trxApm", value)}
              min={0}
              step={0.01}
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
                key={`payin-${region}-tier-${index}`}
                className="rounded-lg border border-slate-200 bg-slate-50 p-3"
              >
                <p className="text-sm font-bold text-slate-700">Tier {index + 1}</p>
                <div className="mt-2 grid gap-3 md:grid-cols-3">
                  <NumberField
                    label="MDR (%)"
                    value={tier.mdrPercent}
                    onChange={value =>
                      setTierField(
                        index as 0 | 1 | 2,
                        "mdrPercent",
                        value
                      )
                    }
                    min={0}
                    max={10}
                    step={0.05}
                  />
                  <NumberField
                    label="TRX CC (€)"
                    value={tier.trxCc}
                    onChange={value =>
                      setTierField(
                        index as 0 | 1 | 2,
                        "trxCc",
                        value
                      )
                    }
                    min={0}
                    step={0.01}
                  />
                  <NumberField
                    label="TRX APM (€)"
                    value={tier.trxApm}
                    onChange={value =>
                      setTierField(
                        index as 0 | 1 | 2,
                        "trxApm",
                        value
                      )
                    }
                    min={0}
                    step={0.01}
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
      </div>

      {showFormulas ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-base font-bold text-slate-800">Formula Breakdown ({regionLabel})</h4>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
            <MetricCard name="MDR Revenue" value={formatAmount2(preview.mdrRevenue)} />
            <MetricCard name="TRX Revenue" value={formatAmount2(preview.trxRevenue)} />
            <MetricCard name="Total Revenue" value={formatAmount2(preview.totalRevenue)} />
          </div>
          <div className="mt-3 space-y-2">
            {pricing.rateMode === "single" ? (
              <>
                <FormulaLine>
                  Formula: MDR Revenue = {regionLabel} Volume ({formatAmountInteger(volume)}) ×
                  MDR ({formatInputNumber(pricing.single.mdrPercent)}%) ={" "}
                  {formatAmount2(
                    volume * (pricing.single.mdrPercent / 100)
                  )}
                </FormulaLine>
                <FormulaLine>
                  Formula: TRX Revenue ={" "}
                  {pricing.trxFeeEnabled
                    ? `Successful ${regionLabel} CC (${formatCount(
                        successfulCc
                      )}) × TRX CC (${formatVariableAmount(
                        pricing.single.trxCc
                      )}) + Successful ${regionLabel} APM (${formatCount(
                        successfulApm
                      )}) × TRX APM (${formatVariableAmount(
                        pricing.single.trxApm
                      )})`
                    : "TRX disabled"}
                  {" = "}
                  {formatAmount2(preview.trxRevenue)}
                </FormulaLine>
              </>
            ) : (
              <>
                {preview.tierRows.map(row => (
                  <FormulaLine key={`payin-${region}-breakdown-${row.label}`}>
                    {row.label}: Volume {formatAmountInteger(row.volume)} × MDR{" "}
                    {formatInputNumber(row.mdrPercent)}% = {formatAmount2(row.mdrRevenue)};
                    TRX = ({formatInputNumber(row.ccTransactions)} CC trx ×{" "}
                    {formatVariableAmount(row.trxCc)}) + ({formatInputNumber(
                      row.apmTransactions
                    )}{" "}
                    APM trx × {formatVariableAmount(row.trxApm)}) ={" "}
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
