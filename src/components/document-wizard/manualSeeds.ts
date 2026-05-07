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
import {
  DEFAULT_AGREEMENT_PARTIES,
  DEFAULT_DOCUMENT_LEGAL_TERMS,
  DEFAULT_DOCUMENT_SCOPE
} from "./legalDefaults.js";
import {
  buildDocumentHeaderMetaFromCalculator,
  clonePayinRegionPricing,
  clonePayoutPricing
} from "./seedHelpers.js";
import type { DocumentTemplatePayload } from "./types.js";

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
      ...DEFAULT_DOCUMENT_LEGAL_TERMS,
      payoutMinimumFeeEuNa: false,
      payoutMinimumFeeWwNa: false
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
      payoutMinimumFeePerTransactionNa: false,
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
      payoutMinimumFeeEuNa: false,
      payoutMinimumFeeWwNa: false,
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
          trxCcNa: false,
          trxApm: 0,
          trxApmNa: false
        },
        tiers: DEFAULT_PAYIN_EU_PRICING_CONFIG.tiers.map(() => ({
          mdrPercent: 0,
          trxCc: 0,
          trxCcNa: false,
          trxApm: 0,
          trxApmNa: false
        }))
      },
      ww: {
        ...clonePayinRegionPricing(DEFAULT_PAYIN_WW_PRICING_CONFIG),
        tier1UpToMillion: 0,
        tier2UpToMillion: 0,
        single: {
          mdrPercent: 0,
          trxCc: 0,
          trxCcNa: false,
          trxApm: 0,
          trxApmNa: false
        },
        tiers: DEFAULT_PAYIN_WW_PRICING_CONFIG.tiers.map(() => ({
          mdrPercent: 0,
          trxCc: 0,
          trxCcNa: false,
          trxApm: 0,
          trxApmNa: false
        }))
      }
    },
    payoutPricing: {
      ...clonePayoutPricing(DEFAULT_PAYOUT_PRICING_CONFIG),
      tier1UpToMillion: 0,
      tier2UpToMillion: 0,
      single: {
        mdrPercent: 0,
        trxFee: 0,
        trxFeeNa: false
      },
      tiers: DEFAULT_PAYOUT_PRICING_CONFIG.tiers.map(() => ({
        mdrPercent: 0,
        trxFee: 0,
        trxFeeNa: false
      }))
    },
    toggles: {
      settlementIncluded: false,
      payoutMinimumFeeEnabled: false,
      payoutMinimumFeePerTransaction: 0,
      payoutMinimumFeePerTransactionNa: false,
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
