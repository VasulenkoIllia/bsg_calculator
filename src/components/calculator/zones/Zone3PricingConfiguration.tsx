import {
  PAYOUT_MDR_MIN_PERCENT,
  PAYOUT_TRX_MIN_FEE,
  formatAmount2,
  formatAmountInteger,
  formatVariableAmount,
  type CalculatorTypeSelection,
  type PayinRegionPricingConfig,
  type PayinRegionPricingPreview,
  type PayoutPricingConfig,
  type PayoutPricingPreview,
  type PayoutRateMinimumAdjustment,
  type PricingModelType,
  type PricingRateMode,
  type PayinTrafficDerived,
  type PayoutTrafficDerived
} from "../../../domain/calculator/index.js";
import {
  FormulaLine,
  MetricCard,
  MiniToggle,
  NumberField,
  ZoneSection,
  formatCount,
  formatInputNumber
} from "../index.js";
import type { ZoneSectionNavigation } from "../types.js";

export interface Zone3PricingConfigurationProps {
  expanded: boolean;
  onToggle: () => void;
  navigation?: ZoneSectionNavigation;
  settlementIncluded: boolean;
  setSettlementIncluded: (value: boolean) => void;
  calculatorType: CalculatorTypeSelection;
  payin: PayinTrafficDerived;
  payout: PayoutTrafficDerived;
  payinEuPricing: PayinRegionPricingConfig;
  payinWwPricing: PayinRegionPricingConfig;
  payinEuPreview: PayinRegionPricingPreview;
  payinWwPreview: PayinRegionPricingPreview;
  payoutPricing: PayoutPricingConfig;
  payoutPreview: PayoutPricingPreview;
  payoutRateMinimumAdjustments: PayoutRateMinimumAdjustment[];
  payoutSingleRateMinimumAdjustment: PayoutRateMinimumAdjustment | null;
  showZone3Formulas: boolean;
  setPayinRegionModel: (region: "eu" | "ww", model: PricingModelType) => void;
  setPayinRegionRateMode: (region: "eu" | "ww", rateMode: PricingRateMode) => void;
  setPayinRegionTrxEnabled: (region: "eu" | "ww", enabled: boolean) => void;
  setPayinRegionSingleField: (
    region: "eu" | "ww",
    field: "mdrPercent" | "trxCc" | "trxApm",
    value: number
  ) => void;
  setPayinRegionTierField: (
    region: "eu" | "ww",
    tierIndex: 0 | 1 | 2,
    field: "mdrPercent" | "trxCc" | "trxApm",
    value: number
  ) => void;
  setPayinRegionTierBoundary: (
    region: "eu" | "ww",
    boundary: "tier1UpToMillion" | "tier2UpToMillion",
    value: number
  ) => void;
  setPayoutRateMode: (rateMode: PricingRateMode) => void;
  setPayoutSingleField: (field: "mdrPercent" | "trxFee", value: number) => void;
  setPayoutTierField: (
    tierIndex: 0 | 1 | 2,
    field: "mdrPercent" | "trxFee",
    value: number
  ) => void;
  setPayoutTierBoundary: (
    boundary: "tier1UpToMillion" | "tier2UpToMillion",
    value: number
  ) => void;
}

export function Zone3PricingConfiguration({
  expanded,
  onToggle,
  navigation,
  settlementIncluded,
  setSettlementIncluded,
  calculatorType,
  payin,
  payout,
  payinEuPricing,
  payinWwPricing,
  payinEuPreview,
  payinWwPreview,
  payoutPricing,
  payoutPreview,
  payoutRateMinimumAdjustments,
  payoutSingleRateMinimumAdjustment,
  showZone3Formulas,
  setPayinRegionModel,
  setPayinRegionRateMode,
  setPayinRegionTrxEnabled,
  setPayinRegionSingleField,
  setPayinRegionTierField,
  setPayinRegionTierBoundary,
  setPayoutRateMode,
  setPayoutSingleField,
  setPayoutTierField,
  setPayoutTierBoundary
}: Zone3PricingConfigurationProps) {
  return (
        <ZoneSection
          id="zone3"
          title="Zone 3: Pricing Configuration"
          subtitle="Configure Payin/Payout pricing models and rate sets (IC++ / Blended, Single / Tiered)."
          expanded={expanded}
          onToggle={onToggle}
          navigation={navigation}
          headerClassName="border-b border-slate-200 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4 md:px-7"
          contentClassName="p-5 md:p-7"
        >
          <div className="grid gap-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-lg font-bold text-slate-800">General Settings</h3>
              <div className="mt-4">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                  <input
                    className="h-4 w-4 accent-blue-600"
                    type="checkbox"
                    checked={settlementIncluded}
                    onChange={event => setSettlementIncluded(event.target.checked)}
                  />
                  Settlement Included
                </label>
                <p className="mt-2 text-xs text-slate-600">
                  If unchecked, Settlement Fee settings become active in Zone 4.
                </p>
              </div>
            </div>

            {calculatorType.payin ? (
              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-lg font-bold text-slate-800">Payin EU Pricing</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Input basis: EU volume {formatAmountInteger(payin.volume.eu)}, successful EU
                    CC/APM {formatCount(payin.successful.byRegionMethod.euCc)} /{" "}
                    {formatCount(payin.successful.byRegionMethod.euApm)}.
                  </p>
                  <div className="mt-4 grid gap-3">
                    <div>
                      <span className="field-label">Pricing Model</span>
                      <div className="flex flex-wrap gap-2">
                        <MiniToggle
                          label="IC++"
                          selected={payinEuPricing.model === "icpp"}
                          onSelect={() => setPayinRegionModel("eu", "icpp")}
                          ariaLabel="Payin EU model IC++"
                        />
                        <MiniToggle
                          label="Blended"
                          selected={payinEuPricing.model === "blended"}
                          onSelect={() => setPayinRegionModel("eu", "blended")}
                          ariaLabel="Payin EU model Blended"
                        />
                      </div>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                      <input
                        className="h-4 w-4 accent-blue-600"
                        type="checkbox"
                        checked={payinEuPricing.trxFeeEnabled}
                        onChange={event => setPayinRegionTrxEnabled("eu", event.target.checked)}
                      />
                      TRX Fee Enabled
                    </label>
                    <div>
                      <span className="field-label">Rate Type</span>
                      <div className="flex flex-wrap gap-2">
                        <MiniToggle
                          label="Single Rate"
                          selected={payinEuPricing.rateMode === "single"}
                          onSelect={() => setPayinRegionRateMode("eu", "single")}
                          ariaLabel="Payin EU single rate"
                        />
                        <MiniToggle
                          label="Tiered Rates"
                          selected={payinEuPricing.rateMode === "tiered"}
                          onSelect={() => setPayinRegionRateMode("eu", "tiered")}
                          ariaLabel="Payin EU tiered rates"
                        />
                      </div>
                    </div>
                    {payinEuPricing.rateMode === "single" ? (
                      <div className="grid gap-3 md:grid-cols-3">
                        <NumberField
                          label="MDR (%)"
                          value={payinEuPricing.single.mdrPercent}
                          onChange={value => setPayinRegionSingleField("eu", "mdrPercent", value)}
                          min={0}
                          max={10}
                          step={0.05}
                        />
                        <NumberField
                          label="TRX CC (€)"
                          value={payinEuPricing.single.trxCc}
                          onChange={value => setPayinRegionSingleField("eu", "trxCc", value)}
                          min={0}
                          step={0.01}
                        />
                        <NumberField
                          label="TRX APM (€)"
                          value={payinEuPricing.single.trxApm}
                          onChange={value => setPayinRegionSingleField("eu", "trxApm", value)}
                          min={0}
                          step={0.01}
                        />
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <NumberField
                            label="Tier 1 Up To (M)"
                            value={payinEuPricing.tier1UpToMillion}
                            onChange={value => setPayinRegionTierBoundary("eu", "tier1UpToMillion", value)}
                            min={0}
                            max={25}
                            step={1}
                          />
                          <NumberField
                            label="Tier 2 Up To (M)"
                            value={payinEuPricing.tier2UpToMillion}
                            onChange={value => setPayinRegionTierBoundary("eu", "tier2UpToMillion", value)}
                            min={payinEuPricing.tier1UpToMillion}
                            max={25}
                            step={1}
                          />
                        </div>
                        {payinEuPricing.tiers.map((tier, index) => (
                          <div
                            key={`payin-eu-tier-${index}`}
                            className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                          >
                            <p className="text-sm font-bold text-slate-700">Tier {index + 1}</p>
                            <div className="mt-2 grid gap-3 md:grid-cols-3">
                              <NumberField
                                label="MDR (%)"
                                value={tier.mdrPercent}
                                onChange={value =>
                                  setPayinRegionTierField(
                                    "eu",
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
                                  setPayinRegionTierField(
                                    "eu",
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
                                  setPayinRegionTierField(
                                    "eu",
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
                    {payinEuPreview.warnings.length > 0 ? (
                      <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                        {payinEuPreview.warnings.map(warning => (
                          <p key={warning}>{warning}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {showZone3Formulas ? (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <h4 className="text-base font-bold text-slate-800">Formula Breakdown (EU)</h4>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                        <MetricCard name="MDR Revenue" value={formatAmount2(payinEuPreview.mdrRevenue)} />
                        <MetricCard name="TRX Revenue" value={formatAmount2(payinEuPreview.trxRevenue)} />
                        <MetricCard name="Total Revenue" value={formatAmount2(payinEuPreview.totalRevenue)} />
                      </div>
                      <div className="mt-3 space-y-2">
                        {payinEuPricing.rateMode === "single" ? (
                          <>
                            <FormulaLine>
                              Formula: MDR Revenue = EU Volume ({formatAmountInteger(payin.volume.eu)}) ×
                              MDR ({formatInputNumber(payinEuPricing.single.mdrPercent)}%) ={" "}
                              {formatAmount2(
                                payin.volume.eu * (payinEuPricing.single.mdrPercent / 100)
                              )}
                            </FormulaLine>
                            <FormulaLine>
                              Formula: TRX Revenue ={" "}
                              {payinEuPricing.trxFeeEnabled
                                ? `Successful EU CC (${formatCount(
                                    payin.successful.byRegionMethod.euCc
                                  )}) × TRX CC (${formatVariableAmount(
                                    payinEuPricing.single.trxCc
                                  )}) + Successful EU APM (${formatCount(
                                    payin.successful.byRegionMethod.euApm
                                  )}) × TRX APM (${formatVariableAmount(
                                    payinEuPricing.single.trxApm
                                  )})`
                                : "TRX disabled"}
                              {" = "}
                              {formatAmount2(payinEuPreview.trxRevenue)}
                            </FormulaLine>
                          </>
                        ) : (
                          <>
                            {payinEuPreview.tierRows.map(row => (
                              <FormulaLine key={`payin-eu-breakdown-${row.label}`}>
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
                          Formula: Total Revenue = MDR Revenue ({formatAmount2(payinEuPreview.mdrRevenue)}) +
                          TRX Revenue ({formatAmount2(payinEuPreview.trxRevenue)}) ={" "}
                          {formatAmount2(payinEuPreview.totalRevenue)}
                        </FormulaLine>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-lg font-bold text-slate-800">Payin WW Pricing</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Input basis: WW volume {formatAmountInteger(payin.volume.ww)}, successful WW
                    CC/APM {formatCount(payin.successful.byRegionMethod.wwCc)} /{" "}
                    {formatCount(payin.successful.byRegionMethod.wwApm)}.
                  </p>
                  <div className="mt-4 grid gap-3">
                    <div>
                      <span className="field-label">Pricing Model</span>
                      <div className="flex flex-wrap gap-2">
                        <MiniToggle
                          label="IC++"
                          selected={payinWwPricing.model === "icpp"}
                          onSelect={() => setPayinRegionModel("ww", "icpp")}
                          ariaLabel="Payin WW model IC++"
                        />
                        <MiniToggle
                          label="Blended"
                          selected={payinWwPricing.model === "blended"}
                          onSelect={() => setPayinRegionModel("ww", "blended")}
                          ariaLabel="Payin WW model Blended"
                        />
                      </div>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                      <input
                        className="h-4 w-4 accent-blue-600"
                        type="checkbox"
                        checked={payinWwPricing.trxFeeEnabled}
                        onChange={event => setPayinRegionTrxEnabled("ww", event.target.checked)}
                      />
                      TRX Fee Enabled
                    </label>
                    <div>
                      <span className="field-label">Rate Type</span>
                      <div className="flex flex-wrap gap-2">
                        <MiniToggle
                          label="Single Rate"
                          selected={payinWwPricing.rateMode === "single"}
                          onSelect={() => setPayinRegionRateMode("ww", "single")}
                          ariaLabel="Payin WW single rate"
                        />
                        <MiniToggle
                          label="Tiered Rates"
                          selected={payinWwPricing.rateMode === "tiered"}
                          onSelect={() => setPayinRegionRateMode("ww", "tiered")}
                          ariaLabel="Payin WW tiered rates"
                        />
                      </div>
                    </div>
                    {payinWwPricing.rateMode === "single" ? (
                      <div className="grid gap-3 md:grid-cols-3">
                        <NumberField
                          label="MDR (%)"
                          value={payinWwPricing.single.mdrPercent}
                          onChange={value => setPayinRegionSingleField("ww", "mdrPercent", value)}
                          min={0}
                          max={10}
                          step={0.05}
                        />
                        <NumberField
                          label="TRX CC (€)"
                          value={payinWwPricing.single.trxCc}
                          onChange={value => setPayinRegionSingleField("ww", "trxCc", value)}
                          min={0}
                          step={0.01}
                        />
                        <NumberField
                          label="TRX APM (€)"
                          value={payinWwPricing.single.trxApm}
                          onChange={value => setPayinRegionSingleField("ww", "trxApm", value)}
                          min={0}
                          step={0.01}
                        />
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <NumberField
                            label="Tier 1 Up To (M)"
                            value={payinWwPricing.tier1UpToMillion}
                            onChange={value => setPayinRegionTierBoundary("ww", "tier1UpToMillion", value)}
                            min={0}
                            max={25}
                            step={1}
                          />
                          <NumberField
                            label="Tier 2 Up To (M)"
                            value={payinWwPricing.tier2UpToMillion}
                            onChange={value => setPayinRegionTierBoundary("ww", "tier2UpToMillion", value)}
                            min={payinWwPricing.tier1UpToMillion}
                            max={25}
                            step={1}
                          />
                        </div>
                        {payinWwPricing.tiers.map((tier, index) => (
                          <div
                            key={`payin-ww-tier-${index}`}
                            className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                          >
                            <p className="text-sm font-bold text-slate-700">Tier {index + 1}</p>
                            <div className="mt-2 grid gap-3 md:grid-cols-3">
                              <NumberField
                                label="MDR (%)"
                                value={tier.mdrPercent}
                                onChange={value =>
                                  setPayinRegionTierField(
                                    "ww",
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
                                  setPayinRegionTierField(
                                    "ww",
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
                                  setPayinRegionTierField(
                                    "ww",
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
                    {payinWwPreview.warnings.length > 0 ? (
                      <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                        {payinWwPreview.warnings.map(warning => (
                          <p key={warning}>{warning}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {showZone3Formulas ? (
                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <h4 className="text-base font-bold text-slate-800">Formula Breakdown (WW)</h4>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                        <MetricCard name="MDR Revenue" value={formatAmount2(payinWwPreview.mdrRevenue)} />
                        <MetricCard name="TRX Revenue" value={formatAmount2(payinWwPreview.trxRevenue)} />
                        <MetricCard name="Total Revenue" value={formatAmount2(payinWwPreview.totalRevenue)} />
                      </div>
                      <div className="mt-3 space-y-2">
                        {payinWwPricing.rateMode === "single" ? (
                          <>
                            <FormulaLine>
                              Formula: MDR Revenue = WW Volume ({formatAmountInteger(payin.volume.ww)}) ×
                              MDR ({formatInputNumber(payinWwPricing.single.mdrPercent)}%) ={" "}
                              {formatAmount2(
                                payin.volume.ww * (payinWwPricing.single.mdrPercent / 100)
                              )}
                            </FormulaLine>
                            <FormulaLine>
                              Formula: TRX Revenue ={" "}
                              {payinWwPricing.trxFeeEnabled
                                ? `Successful WW CC (${formatCount(
                                    payin.successful.byRegionMethod.wwCc
                                  )}) × TRX CC (${formatVariableAmount(
                                    payinWwPricing.single.trxCc
                                  )}) + Successful WW APM (${formatCount(
                                    payin.successful.byRegionMethod.wwApm
                                  )}) × TRX APM (${formatVariableAmount(
                                    payinWwPricing.single.trxApm
                                  )})`
                                : "TRX disabled"}
                              {" = "}
                              {formatAmount2(payinWwPreview.trxRevenue)}
                            </FormulaLine>
                          </>
                        ) : (
                          <>
                            {payinWwPreview.tierRows.map(row => (
                              <FormulaLine key={`payin-ww-breakdown-${row.label}`}>
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
                          Formula: Total Revenue = MDR Revenue ({formatAmount2(payinWwPreview.mdrRevenue)}) +
                          TRX Revenue ({formatAmount2(payinWwPreview.trxRevenue)}) ={" "}
                          {formatAmount2(payinWwPreview.totalRevenue)}
                        </FormulaLine>
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            {calculatorType.payout ? (
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
                        selected={payoutPricing.rateMode === "single"}
                        onSelect={() => setPayoutRateMode("single")}
                        ariaLabel="Payout single rate"
                      />
                      <MiniToggle
                        label="Tiered Rates"
                        selected={payoutPricing.rateMode === "tiered"}
                        onSelect={() => setPayoutRateMode("tiered")}
                        ariaLabel="Payout tiered rates"
                      />
                    </div>
                  </div>
                  {payoutPricing.rateMode === "single" ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <NumberField
                        label="MDR (%)"
                        value={payoutPricing.single.mdrPercent}
                        onChange={value => setPayoutSingleField("mdrPercent", value)}
                        min={0}
                        max={5}
                        step={0.05}
                        helper={
                          payoutSingleRateMinimumAdjustment?.mdrMinimumApplied
                            ? `Configured ${formatInputNumber(
                                payoutSingleRateMinimumAdjustment.configuredMdrPercent
                              )}% -> Applied ${formatInputNumber(
                                payoutSingleRateMinimumAdjustment.appliedMdrPercent
                              )}% (minimum floor).`
                            : undefined
                        }
                        helperTone="warning"
                      />
                      <NumberField
                        label="TRX Fee (€)"
                        value={payoutPricing.single.trxFee}
                        onChange={value => setPayoutSingleField("trxFee", value)}
                        min={0}
                        step={0.01}
                        helper={
                          payoutSingleRateMinimumAdjustment?.trxMinimumApplied
                            ? `Configured ${formatVariableAmount(
                                payoutSingleRateMinimumAdjustment.configuredTrxFee
                              )} -> Applied ${formatVariableAmount(
                                payoutSingleRateMinimumAdjustment.appliedTrxFee
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
                          value={payoutPricing.tier1UpToMillion}
                          onChange={value => setPayoutTierBoundary("tier1UpToMillion", value)}
                          min={0}
                          max={25}
                          step={1}
                        />
                        <NumberField
                          label="Tier 2 Up To (M)"
                          value={payoutPricing.tier2UpToMillion}
                          onChange={value => setPayoutTierBoundary("tier2UpToMillion", value)}
                          min={payoutPricing.tier1UpToMillion}
                          max={25}
                          step={1}
                        />
                      </div>
                      {payoutPricing.tiers.map((tier, index) => (
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
                                setPayoutTierField(index as 0 | 1 | 2, "mdrPercent", value)
                              }
                              min={0}
                              max={5}
                              step={0.05}
                              helper={
                                payoutPreview.minimumAdjustments[index]?.mdrMinimumApplied
                                  ? `Configured ${formatInputNumber(
                                      payoutPreview.minimumAdjustments[index].configuredMdrPercent
                                    )}% -> Applied ${formatInputNumber(
                                      payoutPreview.minimumAdjustments[index].appliedMdrPercent
                                    )}% (minimum floor).`
                                  : undefined
                              }
                              helperTone="warning"
                            />
                            <NumberField
                              label="TRX Fee (€)"
                              value={tier.trxFee}
                              onChange={value =>
                                setPayoutTierField(index as 0 | 1 | 2, "trxFee", value)
                              }
                              min={0}
                              step={0.01}
                              helper={
                                payoutPreview.minimumAdjustments[index]?.trxMinimumApplied
                                  ? `Configured ${formatVariableAmount(
                                      payoutPreview.minimumAdjustments[index].configuredTrxFee
                                    )} -> Applied ${formatVariableAmount(
                                      payoutPreview.minimumAdjustments[index].appliedTrxFee
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
                  {payoutPreview.warnings.length > 0 ? (
                    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      {payoutPreview.warnings.map(warning => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  ) : null}
                  {payoutRateMinimumAdjustments.length > 0 ? (
                    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                      <p className="font-bold">Minimum floors applied in payout calculations:</p>
                      {payoutRateMinimumAdjustments.map(adjustment => (
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

                {showZone3Formulas ? (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h4 className="text-base font-bold text-slate-800">Formula Breakdown (Payout)</h4>
                    <div className="mt-3 grid gap-3 md:grid-cols-3">
                      <MetricCard name="MDR Revenue" value={formatAmount2(payoutPreview.mdrRevenue)} />
                      <MetricCard name="TRX Revenue" value={formatAmount2(payoutPreview.trxRevenue)} />
                      <MetricCard name="Total Revenue" value={formatAmount2(payoutPreview.totalRevenue)} />
                    </div>
                    <div className="mt-3 space-y-2">
                      {payoutPricing.rateMode === "single" ? (
                        <>
                          <FormulaLine>
                            Formula: MDR Revenue = Monthly Payout Volume (
                            {formatAmountInteger(payout.normalized.monthlyVolume)}) × MDR (
                            {formatInputNumber(
                              payoutSingleRateMinimumAdjustment?.appliedMdrPercent ??
                                payoutPricing.single.mdrPercent
                            )}
                            %) ={" "}
                            {formatAmount2(
                              payout.normalized.monthlyVolume *
                                ((payoutSingleRateMinimumAdjustment?.appliedMdrPercent ??
                                  payoutPricing.single.mdrPercent) /
                                  100)
                            )}
                          </FormulaLine>
                          {payoutSingleRateMinimumAdjustment?.mdrMinimumApplied ? (
                            <FormulaLine className="border-amber-300 bg-amber-50 text-amber-900">
                              Minimum MDR floor applied: configured{" "}
                              {formatInputNumber(payoutSingleRateMinimumAdjustment.configuredMdrPercent)}%{" "}
                              {"->"} used in calculation{" "}
                              {formatInputNumber(payoutSingleRateMinimumAdjustment.appliedMdrPercent)}% (
                              min {formatInputNumber(PAYOUT_MDR_MIN_PERCENT)}%).
                            </FormulaLine>
                          ) : null}
                          <FormulaLine>
                            Formula: TRX Revenue = Payout Transactions (
                            {formatCount(payout.normalized.totalTransactions)}) × TRX Fee (
                            {formatVariableAmount(
                              payoutSingleRateMinimumAdjustment?.appliedTrxFee ??
                                payoutPricing.single.trxFee
                            )}
                            ) ={" "}
                            {formatAmount2(payoutPreview.trxRevenue)}
                          </FormulaLine>
                          {payoutSingleRateMinimumAdjustment?.trxMinimumApplied ? (
                            <FormulaLine className="border-amber-300 bg-amber-50 text-amber-900">
                              Minimum TRX floor applied: configured{" "}
                              {formatVariableAmount(
                                payoutSingleRateMinimumAdjustment.configuredTrxFee
                              )}{" "}
                              {"->"} used in calculation{" "}
                              {formatVariableAmount(
                                payoutSingleRateMinimumAdjustment.appliedTrxFee
                              )}{" "}
                              (min {formatVariableAmount(PAYOUT_TRX_MIN_FEE)}).
                            </FormulaLine>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {payoutPreview.tierRows.map(row => (
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
                        Formula: Total Revenue = MDR Revenue ({formatAmount2(payoutPreview.mdrRevenue)}) +
                        TRX Revenue ({formatAmount2(payoutPreview.trxRevenue)}) ={" "}
                        {formatAmount2(payoutPreview.totalRevenue)}
                      </FormulaLine>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </ZoneSection>

  );
}
