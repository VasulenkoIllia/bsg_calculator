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
      ...DEFAULT_DOCUMENT_LEGAL_TERMS
    },
    payinPricing: {
      eu: {
        model: payinEuPricing.model,
        rateMode: payinEuPricing.rateMode,
        trxFeeEnabled: payinEuPricing.trxFeeEnabled,
        tier1UpToMillion: payinEuPricing.tier1UpToMillion,
        tier2UpToMillion: payinEuPricing.tier2UpToMillion,
        single: { ...payinEuPricing.single },
        tiers: payinEuPricing.tiers.map(tier => ({ ...tier }))
      },
      ww: {
        model: payinWwPricing.model,
        rateMode: payinWwPricing.rateMode,
        trxFeeEnabled: payinWwPricing.trxFeeEnabled,
        tier1UpToMillion: payinWwPricing.tier1UpToMillion,
        tier2UpToMillion: payinWwPricing.tier2UpToMillion,
        single: { ...payinWwPricing.single },
        tiers: payinWwPricing.tiers.map(tier => ({ ...tier }))
      }
    },
    payoutPricing: {
      rateMode: payoutPricing.rateMode,
      tier1UpToMillion: payoutPricing.tier1UpToMillion,
      tier2UpToMillion: payoutPricing.tier2UpToMillion,
      single: { ...payoutPricing.single },
      tiers: payoutPricing.tiers.map(tier => ({ ...tier }))
    },
    toggles: {
      settlementIncluded,
      payoutMinimumFeeEnabled,
      payoutMinimumFeePerTransaction,
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
