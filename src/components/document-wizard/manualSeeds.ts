import {
  DEFAULT_CONTRACT_SUMMARY_SETTINGS,
  DEFAULT_FAILED_TRX_CHARGING_CONFIG,
  DEFAULT_PAYIN_EU_PRICING_CONFIG,
  DEFAULT_PAYIN_WW_PRICING_CONFIG,
  DEFAULT_PAYOUT_MINIMUM_FEE_CONFIG,
  DEFAULT_PAYOUT_PRICING_CONFIG
} from "../../domain/calculator/index.js";
import {
  DEFAULT_AGREEMENT_PARTIES,
  DEFAULT_DOCUMENT_LEGAL_TERMS,
  DEFAULT_DOCUMENT_SCOPE
} from "./legalDefaults.js";
import {
  applyPayinTrxFloorDefaults,
  buildDocumentHeaderMetaFromCalculator,
  clonePayinRegionPricing,
  clonePayoutPricing
} from "./seedHelpers.js";
import type { DocumentTemplatePayload } from "./types.js";
import {
  DISPUTE_COST_MIN,
  MONTHLY_MINIMUM_FEE_DEFAULT,
  PAYIN_TRX_APM_MIN,
  PAYIN_TRX_CC_MIN,
  REFUND_COST_MIN,
  ROLLING_RESERVE_HOLD_DAYS_DEFAULT,
  SETTLEMENT_FEE_RATE_DEFAULT,
  THREE_DS_FEE_MIN
} from "./wizardDefaults.js";

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
      // Provider-cost fee defaults (override the frozen calculator
      // config); the wizard min props prevent going below.
      refundCost: REFUND_COST_MIN,
      disputeCost: DISPUTE_COST_MIN,
      rollingReserveHoldDays: ROLLING_RESERVE_HOLD_DAYS_DEFAULT,
      payoutMinimumFeeEuNa: false,
      payoutMinimumFeeWwNa: false,
      customTermsItems: [],
      payinCustomNoteEnabled: false,
      payinCustomNoteText: "",
      payoutCustomNoteEnabled: false,
      payoutCustomNoteText: ""
    },
    payinPricing: {
      eu: applyPayinTrxFloorDefaults(clonePayinRegionPricing(DEFAULT_PAYIN_EU_PRICING_CONFIG)),
      ww: applyPayinTrxFloorDefaults(clonePayinRegionPricing(DEFAULT_PAYIN_WW_PRICING_CONFIG)),
      // Operator-added rows; manual seed never starts with any.
      customRows: []
    },
    payoutPricing: clonePayoutPricing(DEFAULT_PAYOUT_PRICING_CONFIG),
    // Manual docs start with the limits unset → render N/A · TBD.
    valueModes: {
      payoutLimitMax: "na",
      rollingReserveCap: "tbd"
    },
    toggles: {
      settlementIncluded: false,
      payoutMinimumFeeEnabled: DEFAULT_PAYOUT_MINIMUM_FEE_CONFIG.enabled,
      payoutMinimumFeePerTransaction: DEFAULT_PAYOUT_MINIMUM_FEE_CONFIG.minimumFeePerTransaction,
      payoutMinimumFeePerTransactionNa: false,
      // 3DS / Settlement / Monthly Min shown by default (toggleable).
      threeDsEnabled: true,
      threeDsRevenuePerSuccessfulTransaction: THREE_DS_FEE_MIN,
      settlementFeeEnabled: true,
      settlementFeeRatePercent: SETTLEMENT_FEE_RATE_DEFAULT,
      monthlyMinimumFeeEnabled: true,
      monthlyMinimumFeeAmount: MONTHLY_MINIMUM_FEE_DEFAULT,
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
      customTermsItems: [],
      payinCustomNoteEnabled: false,
      payinCustomNoteText: "",
      payoutCustomNoteEnabled: false,
      payoutCustomNoteText: "",
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
          trxCc: PAYIN_TRX_CC_MIN,
          trxCcNa: false,
          trxApm: PAYIN_TRX_APM_MIN,
          trxApmNa: false
        },
        // Zero-tier triplet — wizard `tiers` is a fixed-length tuple
        // (`[PayinFeeBlock, PayinFeeBlock, PayinFeeBlock]`), so the
        // shape is spelled out here rather than via `.map()` which
        // widens to a plain array.
        tiers: [
          { mdrPercent: 0, trxCc: PAYIN_TRX_CC_MIN, trxCcNa: false, trxApm: PAYIN_TRX_APM_MIN, trxApmNa: false },
          { mdrPercent: 0, trxCc: PAYIN_TRX_CC_MIN, trxCcNa: false, trxApm: PAYIN_TRX_APM_MIN, trxApmNa: false },
          { mdrPercent: 0, trxCc: PAYIN_TRX_CC_MIN, trxCcNa: false, trxApm: PAYIN_TRX_APM_MIN, trxApmNa: false }
        ]
      },
      ww: {
        ...clonePayinRegionPricing(DEFAULT_PAYIN_WW_PRICING_CONFIG),
        tier1UpToMillion: 0,
        tier2UpToMillion: 0,
        single: {
          mdrPercent: 0,
          trxCc: PAYIN_TRX_CC_MIN,
          trxCcNa: false,
          trxApm: PAYIN_TRX_APM_MIN,
          trxApmNa: false
        },
        tiers: [
          { mdrPercent: 0, trxCc: PAYIN_TRX_CC_MIN, trxCcNa: false, trxApm: PAYIN_TRX_APM_MIN, trxApmNa: false },
          { mdrPercent: 0, trxCc: PAYIN_TRX_CC_MIN, trxCcNa: false, trxApm: PAYIN_TRX_APM_MIN, trxApmNa: false },
          { mdrPercent: 0, trxCc: PAYIN_TRX_CC_MIN, trxCcNa: false, trxApm: PAYIN_TRX_APM_MIN, trxApmNa: false }
        ]
      },
      // Operator-added rows; blank manual seed never starts with any.
      customRows: []
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
    // Blank docs start with the limits unset → render N/A · TBD
    // (consistent with the defaults seed + fromCalculator).
    valueModes: {
      payoutLimitMax: "na",
      rollingReserveCap: "tbd"
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
