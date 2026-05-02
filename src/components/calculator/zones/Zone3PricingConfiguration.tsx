import {
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
  ZoneSection,
} from "../index.js";
import type { ZoneSectionNavigation } from "../types.js";
import { PayinRegionPricingPanel } from "./zone3/PayinRegionPricingPanel.js";
import { PayoutPricingPanel } from "./zone3/PayoutPricingPanel.js";

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
                <PayinRegionPricingPanel
                  region="eu"
                  regionLabel="EU"
                  pricing={payinEuPricing}
                  preview={payinEuPreview}
                  payin={payin}
                  showFormulas={showZone3Formulas}
                  setModel={model => setPayinRegionModel("eu", model)}
                  setRateMode={rateMode => setPayinRegionRateMode("eu", rateMode)}
                  setTrxEnabled={enabled => setPayinRegionTrxEnabled("eu", enabled)}
                  setSingleField={(field, value) => setPayinRegionSingleField("eu", field, value)}
                  setTierField={(tierIndex, field, value) => setPayinRegionTierField("eu", tierIndex, field, value)}
                  setTierBoundary={(boundary, value) => setPayinRegionTierBoundary("eu", boundary, value)}
                />
                <PayinRegionPricingPanel
                  region="ww"
                  regionLabel="WW"
                  pricing={payinWwPricing}
                  preview={payinWwPreview}
                  payin={payin}
                  showFormulas={showZone3Formulas}
                  setModel={model => setPayinRegionModel("ww", model)}
                  setRateMode={rateMode => setPayinRegionRateMode("ww", rateMode)}
                  setTrxEnabled={enabled => setPayinRegionTrxEnabled("ww", enabled)}
                  setSingleField={(field, value) => setPayinRegionSingleField("ww", field, value)}
                  setTierField={(tierIndex, field, value) => setPayinRegionTierField("ww", tierIndex, field, value)}
                  setTierBoundary={(boundary, value) => setPayinRegionTierBoundary("ww", boundary, value)}
                />
              </div>
            ) : null}

            {calculatorType.payout ? (
              <PayoutPricingPanel
                payout={payout}
                pricing={payoutPricing}
                preview={payoutPreview}
                rateMinimumAdjustments={payoutRateMinimumAdjustments}
                singleRateMinimumAdjustment={payoutSingleRateMinimumAdjustment}
                showFormulas={showZone3Formulas}
                setRateMode={setPayoutRateMode}
                setSingleField={setPayoutSingleField}
                setTierField={setPayoutTierField}
                setTierBoundary={setPayoutTierBoundary}
              />
            ) : null}
          </div>
        </ZoneSection>

  );
}
