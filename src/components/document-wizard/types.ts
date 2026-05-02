import type { AgreementParties, DocumentScope } from "./legalDefaults.js";

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ValueMode = "value" | "waived" | "na" | "tbd";
export type PayinRegionMode = "both" | "euOnly" | "wwOnly" | "none";
export type PayinTableMode = "byRegionTiered" | "byRegionFlat" | "flatTiered" | "flatSingle";
export type PayoutRegionMode = "global" | "none";
export type PayoutTableMode = "globalTiered" | "globalFlat";

export interface DocumentWizardLayout {
  source: "calculator" | "manual" | "clone";
  payin: {
    regionMode: PayinRegionMode;
    tableMode: PayinTableMode;
  };
  payout: {
    regionMode: PayoutRegionMode;
    tableMode: PayoutTableMode;
  };
}

export interface DocumentWizardValueModes {
  accountSetupFee?: ValueMode;
  refundCost?: ValueMode;
  disputeCost?: ValueMode;
  threeDsFee?: ValueMode;
  settlementFee?: ValueMode;
  monthlyMinimumFee?: ValueMode;
  rollingReserveCap?: ValueMode;
  payoutLimitMax?: ValueMode;
}

export interface DocumentHeaderMetaDraft {
  documentType: string;
  documentNumber: string;
  documentDateIso: string;
  collectionModel: string;
  collectionFrequency: string;
}

export interface DocumentTemplatePayload {
  header: DocumentHeaderMetaDraft;
  documentScope: DocumentScope;
  agreementParties: AgreementParties;
  layout: DocumentWizardLayout;
  valueModes?: DocumentWizardValueModes;
  calculatorType: {
    payin: boolean;
    payout: boolean;
  };
  payin: {
    euPercent: number;
    wwPercent: number;
    ccPercent: number;
    apmPercent: number;
  };
  contractSummary: {
    settlementPeriod: string;
    collectionLimitMin: number;
    collectionLimitMax: number;
    payoutLimitMin: number;
    payoutLimitMax: number | null;
    rollingReservePercent: number;
    rollingReserveHoldDays: number;
    rollingReserveCap: number | null;
    payoutMinimumFeeMode: "overall" | "byRegion";
    payoutMinimumFeeThresholdMillion: number;
    payoutMinimumFeePerTransaction: number;
    payoutMinimumFeeEuThresholdMillion: number;
    payoutMinimumFeeEuPerTransaction: number;
    payoutMinimumFeeWwThresholdMillion: number;
    payoutMinimumFeeWwPerTransaction: number;
    accountSetupFee: number;
    refundCost: number;
    disputeCost: number;
    settlementNote: string;
    clientType: string;
    restrictedJurisdictions: string;
  };
  payinPricing: {
    eu: {
      model: "icpp" | "blended";
      rateMode: "single" | "tiered";
      trxFeeEnabled: boolean;
      tier1UpToMillion: number;
      tier2UpToMillion: number;
      single: { mdrPercent: number; trxCc: number; trxApm: number };
      tiers: Array<{ mdrPercent: number; trxCc: number; trxApm: number }>;
    };
    ww: {
      model: "icpp" | "blended";
      rateMode: "single" | "tiered";
      trxFeeEnabled: boolean;
      tier1UpToMillion: number;
      tier2UpToMillion: number;
      single: { mdrPercent: number; trxCc: number; trxApm: number };
      tiers: Array<{ mdrPercent: number; trxCc: number; trxApm: number }>;
    };
  };
  payoutPricing: {
    rateMode: "single" | "tiered";
    tier1UpToMillion: number;
    tier2UpToMillion: number;
    single: { mdrPercent: number; trxFee: number };
    tiers: Array<{ mdrPercent: number; trxFee: number }>;
  };
  toggles: {
    settlementIncluded: boolean;
    payoutMinimumFeeEnabled: boolean;
    payoutMinimumFeePerTransaction: number;
    threeDsEnabled: boolean;
    threeDsRevenuePerSuccessfulTransaction: number;
    settlementFeeEnabled: boolean;
    settlementFeeRatePercent: number;
    monthlyMinimumFeeEnabled: boolean;
    monthlyMinimumFeeAmount: number;
    failedTrxEnabled: boolean;
    failedTrxMode: "overLimitOnly" | "allFailedVolume";
    failedTrxOverLimitThresholdPercent: number;
  };
}
