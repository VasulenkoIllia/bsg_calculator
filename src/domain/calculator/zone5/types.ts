import type { IntroducerCommissionType } from "../zone2/introducerCommission.js";
import type { PricingModelType } from "../zone3/pricingConfiguration.js";

export interface ProviderTierConfig {
  tier1UpToMillion: number;
  tier2UpToMillion: number;
  tier1Rate: number;
  tier2Rate: number;
  tier3Rate: number;
}

export interface TierPercentCostRow {
  label: string;
  volume: number;
  ratePercent: number;
  cost: number;
}

export interface TierTrxCostRow {
  label: string;
  volume: number;
  transactions: number;
  feePerTransaction: number;
  cost: number;
}

export interface PayinRegionProfitabilityInput {
  volume: number;
  mdrRevenue: number;
  trxRevenue: number;
  failedTrxRevenue: number;
  attemptsCcTransactions: number;
  attemptsApmTransactions: number;
  pricingModel: PricingModelType;
  schemeFeesPercent: number;
  interchangePercent: number;
  providerTrxCcCost?: number;
  providerTrxApmCost?: number;
}

export interface PayinRegionProfitability {
  revenue: {
    mdr: number;
    trx: number;
    failedTrx: number;
    total: number;
  };
  costs: {
    providerMdr: number;
    providerTrx: number;
    schemeFees: number;
    interchange: number;
    total: number;
  };
  providerMdrRows: [TierPercentCostRow, TierPercentCostRow, TierPercentCostRow];
  providerTrxBreakdown: {
    attemptsCc: number;
    attemptsApm: number;
    ccCost: number;
    apmCost: number;
    total: number;
  };
  netMargin: number;
}

export interface PayinProfitabilityInput {
  eu: PayinRegionProfitabilityInput;
  ww: PayinRegionProfitabilityInput;
}

export interface PayinProfitabilityResult {
  eu: PayinRegionProfitability;
  ww: PayinRegionProfitability;
  revenue: {
    mdr: number;
    trx: number;
    failedTrx: number;
    total: number;
  };
  costs: {
    providerMdr: number;
    providerTrx: number;
    schemeFees: number;
    interchange: number;
    total: number;
  };
  netMargin: number;
}

export interface PayoutProfitabilityInput {
  volume: number;
  totalTransactions: number;
  mdrRevenue: number;
  trxRevenue: number;
}

export interface PayoutProfitabilityResult {
  revenue: {
    mdr: number;
    trx: number;
    total: number;
  };
  costs: {
    providerMdr: number;
    providerTrx: number;
    total: number;
  };
  providerMdrRows: [TierPercentCostRow, TierPercentCostRow, TierPercentCostRow];
  providerTrxRows: [TierTrxCostRow, TierTrxCostRow, TierTrxCostRow];
  netMargin: number;
}

export interface OtherRevenueProfitabilityInput {
  threeDsRevenue: number;
  threeDsCost: number;
  settlementFeeRevenue: number;
  monthlyMinimumAdjustment: number;
}

export interface OtherRevenueProfitabilityResult {
  revenue: {
    threeDs: number;
    settlementFee: number;
    monthlyMinimumAdjustment: number;
    total: number;
  };
  costs: {
    threeDs: number;
    total: number;
  };
  netMargin: number;
}

export interface TotalProfitabilityInput {
  payin: Pick<PayinProfitabilityResult, "revenue" | "costs" | "netMargin">;
  payout: Pick<PayoutProfitabilityResult, "revenue" | "costs" | "netMargin">;
  other: OtherRevenueProfitabilityResult;
  introducerEnabled: boolean;
  introducerCommissionType: IntroducerCommissionType;
  introducerCommissionAmount: number;
  revSharePercent: number;
}

export interface TotalProfitabilityResult {
  mode: "disabled" | "standardCustom" | "revShare";
  payinNetMargin: number;
  payoutNetMargin: number;
  otherNetMargin: number;
  totalRevenue: number;
  totalCosts: number;
  marginBeforeIntroducer: number;
  introducerCommission: number;
  revSharePercentApplied: number;
  ourMargin: number;
  warning: string | null;
}
