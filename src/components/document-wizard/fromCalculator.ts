import {
  DEFAULT_3DS_FEE_CONFIG,
  DEFAULT_CONTRACT_SUMMARY_SETTINGS,
  DEFAULT_FAILED_TRX_CHARGING_CONFIG,
  DEFAULT_MONTHLY_MINIMUM_FEE_CONFIG,
  DEFAULT_PAYIN_EU_PRICING_CONFIG,
  DEFAULT_PAYIN_WW_PRICING_CONFIG,
  DEFAULT_PAYOUT_MINIMUM_FEE_CONFIG,
  DEFAULT_PAYOUT_PRICING_CONFIG,
  DEFAULT_SETTLEMENT_FEE_CONFIG
} from "../../domain/calculator/index.js";
import type {
  CalculatorTypeSelection,
  ContractSummarySettings,
  FailedTrxChargingMode,
  PayinRegionPricingConfig,
  PayinTrafficDerived,
  PayoutPricingConfig,
  PayoutTrafficDerived,
  PricingModelType
} from "../../domain/calculator/index.js";
import {
  DEFAULT_AGREEMENT_PARTIES,
  DEFAULT_DOCUMENT_LEGAL_TERMS,
  DEFAULT_DOCUMENT_SCOPE,
  DOCUMENT_TYPE_LABELS
} from "./legalDefaults.js";
import type { DocumentHeaderMetaDraft, DocumentTemplatePayload } from "./types.js";

const DEFAULT_COLLECTION_FREQUENCY = "Daily (unless agreed otherwise)";

function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// FN.1 placeholder: returns a transient draft number for UI preview.
// Real numbering follows `BSG-#####-XXXXX` semantics and will be issued by the
// Phase 8 backend numbering service. Replace at the call site once the backend
// allocator is wired in.
function defaultDraftNumber(): string {
  const suffix = String(Date.now() % 100_000).padStart(5, "0");
  return `BSG-DRAFT-${suffix}`;
}

function toCollectionModelToken(model: PricingModelType): string {
  return model === "icpp" ? "IC++" : "Blended";
}

export function resolveCollectionModelDisplay(
  euModel: PricingModelType,
  wwModel: PricingModelType
): string {
  if (euModel === wwModel) {
    return toCollectionModelToken(euModel);
  }
  return "IC++ / Blended";
}

export function buildDocumentHeaderMetaFromCalculator(
  payinEuModel: PricingModelType,
  payinWwModel: PricingModelType
): DocumentHeaderMetaDraft {
  return {
    documentType: DOCUMENT_TYPE_LABELS[DEFAULT_DOCUMENT_SCOPE],
    documentNumber: defaultDraftNumber(),
    documentDateIso: todayIsoDate(),
    collectionModel: resolveCollectionModelDisplay(payinEuModel, payinWwModel),
    collectionFrequency: DEFAULT_COLLECTION_FREQUENCY
  };
}

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
  payout,
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

function clonePayinRegionPricing(pricing: PayinRegionPricingConfig): DocumentTemplatePayload["payinPricing"]["eu"] {
  return {
    ...pricing,
    single: { ...pricing.single },
    tiers: pricing.tiers.map(tier => ({ ...tier }))
  };
}

function clonePayoutPricing(pricing: PayoutPricingConfig): DocumentTemplatePayload["payoutPricing"] {
  return {
    ...pricing,
    single: { ...pricing.single },
    tiers: pricing.tiers.map(tier => ({ ...tier }))
  };
}

export function buildDocumentTemplatePayloadManualDefaults(): DocumentTemplatePayload {
  const header = buildDocumentHeaderMetaFromCalculator(
    DEFAULT_PAYIN_EU_PRICING_CONFIG.model,
    DEFAULT_PAYIN_WW_PRICING_CONFIG.model
  );

  return {
    header,
    documentScope: DEFAULT_DOCUMENT_SCOPE,
    agreementParties: { ...DEFAULT_AGREEMENT_PARTIES },
    layout: {
      source: "manual",
      payin: {
        regionMode: "both",
        tableMode: "byRegionFlat"
      },
      payout: {
        regionMode: "global",
        tableMode: "globalFlat"
      }
    },
    calculatorType: {
      payin: true,
      payout: true
    },
    payin: {
      euPercent: 80,
      wwPercent: 20,
      ccPercent: 90,
      apmPercent: 10
    },
    contractSummary: {
      ...DEFAULT_CONTRACT_SUMMARY_SETTINGS,
      ...DEFAULT_DOCUMENT_LEGAL_TERMS
    },
    payinPricing: {
      eu: clonePayinRegionPricing(DEFAULT_PAYIN_EU_PRICING_CONFIG),
      ww: clonePayinRegionPricing(DEFAULT_PAYIN_WW_PRICING_CONFIG)
    },
    payoutPricing: clonePayoutPricing(DEFAULT_PAYOUT_PRICING_CONFIG),
    toggles: {
      settlementIncluded: false,
      payoutMinimumFeeEnabled: DEFAULT_PAYOUT_MINIMUM_FEE_CONFIG.enabled,
      payoutMinimumFeePerTransaction: DEFAULT_PAYOUT_MINIMUM_FEE_CONFIG.minimumFeePerTransaction,
      threeDsEnabled: DEFAULT_3DS_FEE_CONFIG.enabled,
      threeDsRevenuePerSuccessfulTransaction: DEFAULT_3DS_FEE_CONFIG.revenuePerSuccessfulTransaction,
      settlementFeeEnabled: DEFAULT_SETTLEMENT_FEE_CONFIG.enabled,
      settlementFeeRatePercent: DEFAULT_SETTLEMENT_FEE_CONFIG.ratePercent,
      monthlyMinimumFeeEnabled: DEFAULT_MONTHLY_MINIMUM_FEE_CONFIG.enabled,
      monthlyMinimumFeeAmount: DEFAULT_MONTHLY_MINIMUM_FEE_CONFIG.minimumMonthlyRevenue,
      failedTrxEnabled: DEFAULT_FAILED_TRX_CHARGING_CONFIG.enabled,
      failedTrxMode: DEFAULT_FAILED_TRX_CHARGING_CONFIG.mode,
      failedTrxOverLimitThresholdPercent: DEFAULT_FAILED_TRX_CHARGING_CONFIG.overLimitThresholdPercent
    }
  };
}

export function buildDocumentTemplatePayloadManualBlank(): DocumentTemplatePayload {
  const header = buildDocumentHeaderMetaFromCalculator(
    DEFAULT_PAYIN_EU_PRICING_CONFIG.model,
    DEFAULT_PAYIN_WW_PRICING_CONFIG.model
  );

  return {
    header,
    documentScope: DEFAULT_DOCUMENT_SCOPE,
    agreementParties: { ...DEFAULT_AGREEMENT_PARTIES },
    layout: {
      source: "manual",
      payin: {
        regionMode: "both",
        tableMode: "byRegionFlat"
      },
      payout: {
        regionMode: "global",
        tableMode: "globalFlat"
      }
    },
    calculatorType: {
      payin: true,
      payout: true
    },
    payin: {
      euPercent: 0,
      wwPercent: 0,
      ccPercent: 0,
      apmPercent: 0
    },
    contractSummary: {
      ...DEFAULT_CONTRACT_SUMMARY_SETTINGS,
      ...DEFAULT_DOCUMENT_LEGAL_TERMS,
      accountSetupFee: 0,
      refundCost: 0,
      disputeCost: 0,
      payoutMinimumFeeThresholdMillion: 0,
      payoutMinimumFeePerTransaction: 0,
      payoutMinimumFeeEuThresholdMillion: 0,
      payoutMinimumFeeEuPerTransaction: 0,
      payoutMinimumFeeWwThresholdMillion: 0,
      payoutMinimumFeeWwPerTransaction: 0,
      collectionLimitMin: 0,
      collectionLimitMax: 0,
      payoutLimitMin: 0,
      rollingReservePercent: 0,
      rollingReserveHoldDays: 0
    },
    payinPricing: {
      eu: {
        ...clonePayinRegionPricing(DEFAULT_PAYIN_EU_PRICING_CONFIG),
        tier1UpToMillion: 0,
        tier2UpToMillion: 0,
        single: {
          mdrPercent: 0,
          trxCc: 0,
          trxApm: 0
        },
        tiers: DEFAULT_PAYIN_EU_PRICING_CONFIG.tiers.map(() => ({
          mdrPercent: 0,
          trxCc: 0,
          trxApm: 0
        }))
      },
      ww: {
        ...clonePayinRegionPricing(DEFAULT_PAYIN_WW_PRICING_CONFIG),
        tier1UpToMillion: 0,
        tier2UpToMillion: 0,
        single: {
          mdrPercent: 0,
          trxCc: 0,
          trxApm: 0
        },
        tiers: DEFAULT_PAYIN_WW_PRICING_CONFIG.tiers.map(() => ({
          mdrPercent: 0,
          trxCc: 0,
          trxApm: 0
        }))
      }
    },
    payoutPricing: {
      ...clonePayoutPricing(DEFAULT_PAYOUT_PRICING_CONFIG),
      tier1UpToMillion: 0,
      tier2UpToMillion: 0,
      single: {
        mdrPercent: 0,
        trxFee: 0
      },
      tiers: DEFAULT_PAYOUT_PRICING_CONFIG.tiers.map(() => ({
        mdrPercent: 0,
        trxFee: 0
      }))
    },
    toggles: {
      settlementIncluded: false,
      payoutMinimumFeeEnabled: false,
      payoutMinimumFeePerTransaction: 0,
      threeDsEnabled: false,
      threeDsRevenuePerSuccessfulTransaction: 0,
      settlementFeeEnabled: false,
      settlementFeeRatePercent: 0,
      monthlyMinimumFeeEnabled: false,
      monthlyMinimumFeeAmount: 0,
      failedTrxEnabled: false,
      failedTrxMode: DEFAULT_FAILED_TRX_CHARGING_CONFIG.mode,
      failedTrxOverLimitThresholdPercent: 0
    }
  };
}

export function buildDocumentTemplatePayloadManual(): DocumentTemplatePayload {
  return buildDocumentTemplatePayloadManualBlank();
}
