import type { AgreementParties, DocumentScope } from "./legalDefaults.js";

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ValueMode = "value" | "waived" | "na" | "tbd";

// Colour choice for user-added custom Terms & Limitations blocks. Maps
// 1-to-1 to the `.terms-value-blue / -black / -orange` CSS classes in
// the PDF. Standard built-in fields are unaffected — they keep the
// default colour scheme.
export type CustomTermsItemColor = "blue" | "black" | "orange";

export interface CustomTermsItem {
  // Stable identifier so React can key the wizard list and so removing
  // / reordering items in the future stays predictable.
  id: string;
  // User-typed heading (e.g. "** Decline fee removal").
  label: string;
  // User-typed body text.
  value: string;
  // Body text colour — picked in the wizard. Heading keeps the default
  // blue label colour for consistency with built-in rows.
  color: CustomTermsItemColor;
}
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
  // Transaction Limits — every limit can be rendered as a number,
  // N/A or TBD via the wizard. The PDF chooses what to print using
  // resolveModeValue. If mode is value/undefined and the underlying
  // number is empty/0, the corresponding row hides — explicit user
  // choice only, no auto-defaults.
  collectionLimitMin?: ValueMode;
  collectionLimitMax?: ValueMode;
  payoutLimitMin?: ValueMode;
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
    // Per-region "N/A" toggles for the MIN. TRANSACTION FEE column on
    // the payin (Card Acquiring) table. When true, the corresponding
    // region row renders the literal "N/A" instead of the threshold-
    // based value, regardless of payoutMinimumFeeMode.
    payoutMinimumFeeEuNa: boolean;
    payoutMinimumFeeWwNa: boolean;
    accountSetupFee: number;
    refundCost: number;
    disputeCost: number;
    settlementNote: string;
    clientType: string;
    restrictedJurisdictions: string;
    // User-defined extra rows appended to the Terms & Limitations grid.
    // They follow the same 2-column layout and page-break behaviour as
    // built-in rows. Empty array means no custom rows.
    customTermsItems: CustomTermsItem[];
  };
  payinPricing: {
    eu: PayinRegionPricing;
    ww: PayinRegionPricing;
  };
  payoutPricing: {
    rateMode: "single" | "tiered";
    tier1UpToMillion: number;
    tier2UpToMillion: number;
    single: PayoutFeeBlock;
    tiers: PayoutFeeBlock[];
  };
  toggles: {
    settlementIncluded: boolean;
    payoutMinimumFeeEnabled: boolean;
    payoutMinimumFeePerTransaction: number;
    // "N/A" toggle for the MINIMUM FEE column on the payout (Pay Out)
    // table. When true, the cell renders "N/A".
    payoutMinimumFeePerTransactionNa: boolean;
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

// Per-region payin pricing block (extracted so single + tiers share the
// same shape and the new N/A flags live next to their numeric siblings).
export interface PayinFeeBlock {
  mdrPercent: number;
  trxCc: number;
  // "N/A" toggle for the C/D transaction fee. Renders "C/D: N/A" in PDF.
  trxCcNa: boolean;
  trxApm: number;
  // "N/A" toggle for the APM transaction fee. Renders "APM: N/A" in PDF.
  trxApmNa: boolean;
}

export interface PayinRegionPricing {
  model: "icpp" | "blended";
  rateMode: "single" | "tiered";
  trxFeeEnabled: boolean;
  tier1UpToMillion: number;
  tier2UpToMillion: number;
  single: PayinFeeBlock;
  tiers: PayinFeeBlock[];
}

// Payout pricing block — single trx fee per row plus its N/A toggle.
export interface PayoutFeeBlock {
  mdrPercent: number;
  trxFee: number;
  // "N/A" toggle for the payout transaction fee. Renders "N/A" in PDF.
  trxFeeNa: boolean;
}
