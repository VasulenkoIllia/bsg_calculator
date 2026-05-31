import type {
  CalculatorTypeSelection,
  ContractSummarySettings,
  FailedTrxChargingMode,
  PayinRegionPricingConfig,
  PayinTrafficDerived,
  PayoutPricingConfig,
  PayoutTrafficDerived
} from "../../domain/calculator/index.js";
import {
  DEFAULT_AGREEMENT_PARTIES,
  DEFAULT_DOCUMENT_LEGAL_TERMS,
  DEFAULT_DOCUMENT_SCOPE
} from "./legalDefaults.js";
import { clonePayinRegionPricing, clonePayoutPricing } from "./seedHelpers.js";
import type { DocumentHeaderMetaDraft, DocumentTemplatePayload } from "./types.js";

export {
  buildDocumentHeaderMetaFromCalculator,
  resolveCollectionModelDisplay
} from "./seedHelpers.js";
export {
  buildDocumentTemplatePayloadManual,
  buildDocumentTemplatePayloadManualBlank,
  buildDocumentTemplatePayloadManualDefaults
} from "./manualSeeds.js";

function resolvePayinRegionMode(
  payinEnabled: boolean,
  euPercent: number,
  wwPercent: number
): "both" | "euOnly" | "wwOnly" | "none" {
  if (!payinEnabled) return "none";
  const euEnabled = euPercent > 0;
  const wwEnabled = wwPercent > 0;
  if (euEnabled && wwEnabled) return "both";
  if (euEnabled) return "euOnly";
  if (wwEnabled) return "wwOnly";
  return "none";
}

export interface BuildDocumentTemplatePayloadInput {
  header: DocumentHeaderMetaDraft;
  calculatorType: CalculatorTypeSelection;
  payin: PayinTrafficDerived;
  payout: PayoutTrafficDerived;
  payinEuPricing: PayinRegionPricingConfig;
  payinWwPricing: PayinRegionPricingConfig;
  payoutPricing: PayoutPricingConfig;
  payoutMinimumFeeEnabled: boolean;
  payoutMinimumFeePerTransaction: number;
  threeDsEnabled: boolean;
  threeDsRevenuePerSuccessfulTransaction: number;
  settlementIncluded: boolean;
  settlementFeeEnabled: boolean;
  settlementFeeRatePercent: number;
  monthlyMinimumFeeEnabled: boolean;
  monthlyMinimumFeeAmount: number;
  failedTrxEnabled: boolean;
  /**
   * Calculator-side mode only (2-valued). "free" is a WIZARD-ONLY
   * display mode and must NEVER originate here — it is intentionally
   * not part of FailedTrxChargingMode. The one-way calc → wizard flow
   * keeps the frozen calculator free of wizard-only concepts.
   */
  failedTrxMode: FailedTrxChargingMode;
  failedTrxOverLimitThresholdPercent: number;
  contractSummarySettings: ContractSummarySettings;
}

export function buildDocumentTemplatePayloadFromCalculator({
  header,
  calculatorType,
  payin,
  // payout traffic info is currently unused for payload mapping; kept on the
  // input contract so downstream consumers (Phase 8 backend) can read it.
  payout: _payout,
  payinEuPricing,
  payinWwPricing,
  payoutPricing,
  payoutMinimumFeeEnabled,
  payoutMinimumFeePerTransaction,
  threeDsEnabled,
  threeDsRevenuePerSuccessfulTransaction,
  settlementIncluded,
  settlementFeeEnabled,
  settlementFeeRatePercent,
  monthlyMinimumFeeEnabled,
  monthlyMinimumFeeAmount,
  failedTrxEnabled,
  failedTrxMode,
  failedTrxOverLimitThresholdPercent,
  contractSummarySettings
}: BuildDocumentTemplatePayloadInput): DocumentTemplatePayload {
  const payinRegionMode = resolvePayinRegionMode(
    calculatorType.payin,
    payin.normalized.euPercent,
    payin.normalized.wwPercent
  );
  const payinTableMode = (() => {
    if (payinRegionMode === "none") {
      return payinEuPricing.rateMode === "tiered" || payinWwPricing.rateMode === "tiered"
        ? "flatTiered"
        : "flatSingle";
    }

    if (payinEuPricing.rateMode === "tiered" || payinWwPricing.rateMode === "tiered") {
      return "byRegionTiered";
    }

    return "byRegionFlat";
  })();

  const payoutTableMode = payoutPricing.rateMode === "tiered" ? "globalTiered" : "globalFlat";

  return {
    header: { ...header },
    documentScope: DEFAULT_DOCUMENT_SCOPE,
    agreementParties: { ...DEFAULT_AGREEMENT_PARTIES },
    layout: {
      source: "calculator",
      payin: {
        regionMode: payinRegionMode,
        tableMode: payinTableMode
      },
      payout: {
        regionMode: calculatorType.payout ? "global" : "none",
        tableMode: payoutTableMode
      }
    },
    calculatorType: { ...calculatorType },
    payin: {
      euPercent: payin.normalized.euPercent,
      wwPercent: payin.normalized.wwPercent,
      ccPercent: payin.normalized.ccPercent,
      apmPercent: payin.normalized.apmPercent
    },
    contractSummary: {
      ...contractSummarySettings,
      ...DEFAULT_DOCUMENT_LEGAL_TERMS,
      // N/A toggles default off — calculator only emits numeric values.
      // The user can flip them on in the wizard.
      payoutMinimumFeeEuNa: false,
      payoutMinimumFeeWwNa: false,
      // User-added Terms & Limitations rows — none by default; the
      // user adds them in the wizard.
      customTermsItems: [],
      // Per-section custom notes — disabled by default. The wizard
      // exposes per-step toggles + textareas so the user can add a
      // free-form note rendered under each pricing table.
      payinCustomNoteEnabled: false,
      payinCustomNoteText: "",
      payoutCustomNoteEnabled: false,
      payoutCustomNoteText: ""
    },
    // Pricing blocks delegated to the canonical converters in
    // `seedHelpers.ts`. The payin converter intentionally drops
    // `dedicatedCountries` (calculator-only feature) — see its NOTE.
    payinPricing: {
      eu: clonePayinRegionPricing(payinEuPricing),
      ww: clonePayinRegionPricing(payinWwPricing),
      // Custom rows are an operator-only feature added in the wizard
      // step — the calculator has no concept of them, so the seed is
      // always an empty array.
      customRows: []
    },
    payoutPricing: clonePayoutPricing(payoutPricing),
    toggles: {
      settlementIncluded,
      payoutMinimumFeeEnabled,
      payoutMinimumFeePerTransaction,
      payoutMinimumFeePerTransactionNa: false,
      threeDsEnabled,
      threeDsRevenuePerSuccessfulTransaction,
      settlementFeeEnabled,
      settlementFeeRatePercent,
      monthlyMinimumFeeEnabled,
      monthlyMinimumFeeAmount,
      failedTrxEnabled,
      failedTrxMode,
      failedTrxOverLimitThresholdPercent
    }
  };
}
