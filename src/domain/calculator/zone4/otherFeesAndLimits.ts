export type FailedTrxChargingMode = "overLimitOnly" | "allFailedVolume";
export type SettlementPeriod = "T+1" | "T+2" | "T+3" | "T+4" | "T+5";
export type PayoutMinimumFeeMode = "overall" | "byRegion";

export interface PayoutMinimumFeeConfig {
  enabled: boolean;
  minimumFeePerTransaction: number;
}

export interface ThreeDsFeeConfig {
  enabled: boolean;
  revenuePerSuccessfulTransaction: number;
  providerCostPerAttempt: number;
}

export interface SettlementFeeConfig {
  enabled: boolean;
  ratePercent: number;
}

export interface MonthlyMinimumFeeConfig {
  enabled: boolean;
  minimumMonthlyRevenue: number;
}

export interface FailedTrxChargingConfig {
  enabled: boolean;
  mode: FailedTrxChargingMode;
  overLimitThresholdPercent: number;
}

export interface ContractSummarySettings {
  accountSetupFee: number;
  refundCost: number;
  disputeCost: number;
  settlementPeriod: SettlementPeriod;
  payoutMinimumFeeMode: PayoutMinimumFeeMode;
  payoutMinimumFeeThresholdMillion: number;
  payoutMinimumFeePerTransaction: number;
  payoutMinimumFeeEuThresholdMillion: number;
  payoutMinimumFeeEuPerTransaction: number;
  payoutMinimumFeeWwThresholdMillion: number;
  payoutMinimumFeeWwPerTransaction: number;
  collectionLimitMin: number;
  collectionLimitMax: number;
  payoutLimitMin: number;
  payoutLimitMax: number | null;
  rollingReservePercent: number;
  rollingReserveHoldDays: number;
  rollingReserveCap: number | null;
}

export interface PayoutMinimumFeeImpactInput {
  config: PayoutMinimumFeeConfig;
  payoutTransactions: number;
  payoutRevenue: number;
}

export interface ThreeDsImpactInput {
  config: ThreeDsFeeConfig;
  successfulTransactions: number;
  totalAttempts: number;
}

export interface SettlementFeeImpactInput {
  config: SettlementFeeConfig;
  settlementIncludedInPricing: boolean;
  payinVolume: number;
  payoutVolume: number;
  payinFeesAll: number;
  payoutFeesAll: number;
}

export interface MonthlyMinimumFeeImpactInput {
  config: MonthlyMinimumFeeConfig;
  actualRevenue: number;
}

export interface FailedTrxImpactInput {
  config: FailedTrxChargingConfig;
  successfulTransactions: number;
  totalAttempts: number;
  failedCcTransactions: number;
  failedApmTransactions: number;
  trxCcFee: number;
  trxApmFee: number;
}

export interface PayoutMinimumFeeImpact {
  perTransactionRevenue: number;
  appliedPerTransactionRevenue: number;
  baseRevenue: number;
  adjustedRevenue: number;
  upliftRevenue: number;
  warning: string | null;
}

export interface ThreeDsImpact {
  successfulTransactions: number;
  revenue: number;
  cost: number;
  net: number;
}

export interface SettlementFeeImpact {
  visible: boolean;
  baseNet: number;
  chargeableNet: number;
  fee: number;
  clientNet: number;
}

export interface MonthlyMinimumFeeImpact {
  baseRevenue: number;
  appliedRevenue: number;
  upliftRevenue: number;
  warning: string | null;
}

export interface FailedTrxImpact {
  failedCcTransactions: number;
  failedApmTransactions: number;
  allFailedRevenue: number;
  effectiveRevenue: number;
  thresholdAttempts: number;
  overLimitAttempts: number;
  belowLimitAttempts: number;
}

export const DEFAULT_3DS_REVENUE_PER_SUCCESSFUL = 0.05;
export const PROVIDER_3DS_COST_PER_ATTEMPT = 0.03;

export const DEFAULT_PAYOUT_MINIMUM_FEE_CONFIG: PayoutMinimumFeeConfig = {
  enabled: false,
  minimumFeePerTransaction: 2.5
};

export const DEFAULT_3DS_FEE_CONFIG: ThreeDsFeeConfig = {
  enabled: false,
  revenuePerSuccessfulTransaction: DEFAULT_3DS_REVENUE_PER_SUCCESSFUL,
  providerCostPerAttempt: PROVIDER_3DS_COST_PER_ATTEMPT
};

export const DEFAULT_SETTLEMENT_FEE_CONFIG: SettlementFeeConfig = {
  enabled: false,
  ratePercent: 0.3
};

export const DEFAULT_MONTHLY_MINIMUM_FEE_CONFIG: MonthlyMinimumFeeConfig = {
  enabled: false,
  minimumMonthlyRevenue: 5_000
};

export const DEFAULT_FAILED_TRX_CHARGING_CONFIG: FailedTrxChargingConfig = {
  enabled: false,
  mode: "overLimitOnly",
  overLimitThresholdPercent: 70
};

export const DEFAULT_CONTRACT_SUMMARY_SETTINGS: ContractSummarySettings = {
  accountSetupFee: 0,
  refundCost: 15,
  disputeCost: 75,
  settlementPeriod: "T+2",
  payoutMinimumFeeMode: "overall",
  payoutMinimumFeeThresholdMillion: 2.5,
  payoutMinimumFeePerTransaction: 1,
  payoutMinimumFeeEuThresholdMillion: 2.5,
  payoutMinimumFeeEuPerTransaction: 1,
  payoutMinimumFeeWwThresholdMillion: 2.5,
  payoutMinimumFeeWwPerTransaction: 1,
  collectionLimitMin: 1,
  collectionLimitMax: 2_500,
  payoutLimitMin: 60,
  payoutLimitMax: null,
  rollingReservePercent: 10,
  rollingReserveHoldDays: 90,
  rollingReserveCap: null
};

function safeNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function roundUpToTenth(value: number): number {
  const normalized = safeNonNegative(value);
  return Math.ceil(normalized * 10) / 10;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

export function normalizePayoutMinimumFeePerTransaction(value: number): number {
  return roundUpToTenth(value);
}

export function calculatePayoutMinimumFeeImpact(
  input: PayoutMinimumFeeImpactInput
): PayoutMinimumFeeImpact {
  const payoutTransactions = safeNonNegative(input.payoutTransactions);
  const baseRevenue = safeNonNegative(input.payoutRevenue);
  const minimumFeePerTransaction = normalizePayoutMinimumFeePerTransaction(
    input.config.minimumFeePerTransaction
  );
  const perTransactionRevenue =
    payoutTransactions > 0 ? baseRevenue / payoutTransactions : 0;
  const minimumApplied =
    input.config.enabled &&
    payoutTransactions > 0 &&
    perTransactionRevenue < minimumFeePerTransaction;
  const appliedPerTransactionRevenue = minimumApplied
    ? minimumFeePerTransaction
    : perTransactionRevenue;
  const adjustedRevenue = appliedPerTransactionRevenue * payoutTransactions;
  const upliftRevenue = Math.max(0, adjustedRevenue - baseRevenue);

  return {
    perTransactionRevenue,
    appliedPerTransactionRevenue,
    baseRevenue,
    adjustedRevenue,
    upliftRevenue,
    warning: minimumApplied
      ? "⚠️ Payout Minimum Fee Applied"
      : null
  };
}

export function calculateThreeDsImpact(input: ThreeDsImpactInput): ThreeDsImpact {
  const successfulTransactions = safeNonNegative(input.successfulTransactions);
  const totalAttempts = safeNonNegative(input.totalAttempts);
  const revenuePerSuccessful = safeNonNegative(
    input.config.revenuePerSuccessfulTransaction
  );
  const providerCostPerAttempt = safeNonNegative(
    input.config.providerCostPerAttempt
  );
  const revenue = input.config.enabled
    ? successfulTransactions * revenuePerSuccessful
    : 0;
  const cost = totalAttempts * providerCostPerAttempt;

  return {
    successfulTransactions,
    revenue,
    cost,
    net: revenue - cost
  };
}

export function calculateSettlementFeeImpact(
  input: SettlementFeeImpactInput
): SettlementFeeImpact {
  const visible = !input.settlementIncludedInPricing;
  const payinVolume = safeNonNegative(input.payinVolume);
  const payoutVolume = safeNonNegative(input.payoutVolume);
  const payinFeesAll = safeNonNegative(input.payinFeesAll);
  const payoutFeesAll = safeNonNegative(input.payoutFeesAll);
  const baseNet = payinVolume - payoutVolume - payinFeesAll - payoutFeesAll;
  const chargeableNet = Math.max(0, baseNet);
  const ratePercent = clamp(input.config.ratePercent, 0, 2);
  const fee = visible && input.config.enabled
    ? chargeableNet * (ratePercent / 100)
    : 0;

  return {
    visible,
    baseNet,
    chargeableNet,
    fee,
    clientNet: baseNet - fee
  };
}

export function calculateMonthlyMinimumFeeImpact(
  input: MonthlyMinimumFeeImpactInput
): MonthlyMinimumFeeImpact {
  const baseRevenue = safeNonNegative(input.actualRevenue);
  const minimumMonthlyRevenue = safeNonNegative(input.config.minimumMonthlyRevenue);
  const minimumApplied = input.config.enabled && baseRevenue < minimumMonthlyRevenue;
  const appliedRevenue = minimumApplied ? minimumMonthlyRevenue : baseRevenue;

  return {
    baseRevenue,
    appliedRevenue,
    upliftRevenue: Math.max(0, appliedRevenue - baseRevenue),
    warning: minimumApplied ? "⚠️ Monthly Minimum Fee Applied" : null
  };
}

export function calculateFailedTrxImpact(input: FailedTrxImpactInput): FailedTrxImpact {
  const failedCcTransactions = safeNonNegative(input.failedCcTransactions);
  const failedApmTransactions = safeNonNegative(input.failedApmTransactions);
  const allFailedRevenue =
    failedCcTransactions * safeNonNegative(input.trxCcFee) +
    failedApmTransactions * safeNonNegative(input.trxApmFee);
  const successfulTransactions = safeNonNegative(input.successfulTransactions);
  const totalAttempts = safeNonNegative(input.totalAttempts);
  const thresholdPercent = clamp(input.config.overLimitThresholdPercent, 50, 95);
  const thresholdAttempts =
    thresholdPercent > 0 ? successfulTransactions / (thresholdPercent / 100) : 0;
  const overLimitAttempts = Math.max(0, thresholdAttempts - totalAttempts);
  const belowLimitAttempts = Math.max(0, totalAttempts - thresholdAttempts);
  const effectiveRevenue =
    input.config.enabled && input.config.mode === "allFailedVolume"
      ? allFailedRevenue
      : 0;

  return {
    failedCcTransactions,
    failedApmTransactions,
    allFailedRevenue,
    effectiveRevenue,
    thresholdAttempts,
    overLimitAttempts,
    belowLimitAttempts
  };
}
