import {
  DEFAULT_3DS_FEE_CONFIG,
  DEFAULT_CONTRACT_SUMMARY_SETTINGS,
  DEFAULT_CUSTOM_TIER_SETTINGS,
  DEFAULT_FAILED_TRX_CHARGING_CONFIG,
  DEFAULT_MONTHLY_MINIMUM_FEE_CONFIG,
  DEFAULT_PAYIN_EU_PRICING_CONFIG,
  DEFAULT_PAYIN_WW_PRICING_CONFIG,
  DEFAULT_PAYOUT_MINIMUM_FEE_CONFIG,
  DEFAULT_PAYOUT_PRICING_CONFIG,
  DEFAULT_SETTLEMENT_FEE_CONFIG,
  DEFAULT_SETTLEMENT_INCLUDED,
  type CalculatorTypeSelection,
  type ContractSummarySettings,
  type FailedTrxChargingMode,
  type IntroducerCommissionType,
  type PayinRegionPricingConfig,
  type PayoutPricingConfig
} from "../../domain/calculator/index.js";
import type { ZoneId } from "./types.js";

export type CalculatorStatePreset = {
  calculatorType: CalculatorTypeSelection;
  payinVolume: number;
  payinTransactions: number;
  approvalRatioPercent: number;
  euPercent: number;
  ccPercent: number;
  payoutVolume: number;
  payoutTransactions: number;
  introducerEnabled: boolean;
  introducerCommissionType: IntroducerCommissionType;
  customTier1UpToMillion: number;
  customTier2UpToMillion: number;
  customTier1RatePerMillion: number;
  customTier2RatePerMillion: number;
  customTier3RatePerMillion: number;
  revSharePercent: number;
  settlementIncluded: boolean;
  payinEuPricing: PayinRegionPricingConfig;
  payinWwPricing: PayinRegionPricingConfig;
  payoutPricing: PayoutPricingConfig;
  payoutMinimumFeeEnabled: boolean;
  payoutMinimumFeePerTransaction: number;
  threeDsEnabled: boolean;
  threeDsRevenuePerSuccessfulTransaction: number;
  settlementFeeEnabled: boolean;
  settlementFeeRatePercent: number;
  monthlyMinimumFeeEnabled: boolean;
  monthlyMinimumFeeAmount: number;
  failedTrxEnabled: boolean;
  failedTrxMode: FailedTrxChargingMode;
  failedTrxOverLimitThresholdPercent: number;
  contractSummarySettings: ContractSummarySettings;
  clientNotes: string;
  showHardcodedConstants: boolean;
  showZone3Formulas: boolean;
  showZone4Formulas: boolean;
  showUnifiedFormulas: boolean;
  unifiedExpandedById: Record<string, boolean>;
  zoneExpanded: Record<ZoneId, boolean>;
};

export const INITIAL_ZONE_EXPANDED: Record<ZoneId, boolean> = {
  zone0: true,
  zone1a: true,
  zone1b: true,
  zone2: true,
  zone3: true,
  zone4: true,
  zone5: true,
  zone6: true
};

const DEFAULT_CALCULATOR_TYPE: CalculatorTypeSelection = {
  payin: true,
  payout: false
};

const ZERO_CALCULATOR_TYPE: CalculatorTypeSelection = {
  payin: true,
  payout: false
};

const ZERO_PAYIN_REGION_PRICING_CONFIG: PayinRegionPricingConfig = {
  model: "icpp",
  trxFeeEnabled: false,
  rateMode: "single",
  tier1UpToMillion: 0,
  tier2UpToMillion: 0,
  single: {
    mdrPercent: 0,
    trxCc: 0,
    trxApm: 0
  },
  tiers: [
    { mdrPercent: 0, trxCc: 0, trxApm: 0 },
    { mdrPercent: 0, trxCc: 0, trxApm: 0 },
    { mdrPercent: 0, trxCc: 0, trxApm: 0 }
  ],
  schemeFeesPercent: 0,
  interchangePercent: 0
};

const ZERO_PAYOUT_PRICING_CONFIG: PayoutPricingConfig = {
  rateMode: "single",
  tier1UpToMillion: 0,
  tier2UpToMillion: 0,
  single: {
    mdrPercent: 0,
    trxFee: 0
  },
  tiers: [
    { mdrPercent: 0, trxFee: 0 },
    { mdrPercent: 0, trxFee: 0 },
    { mdrPercent: 0, trxFee: 0 }
  ]
};

const ZERO_CONTRACT_SUMMARY_SETTINGS: ContractSummarySettings = {
  accountSetupFee: 0,
  refundCost: 0,
  disputeCost: 0,
  settlementPeriod: "T+1",
  collectionLimitMin: 0,
  collectionLimitMax: 0,
  payoutLimitMin: 0,
  payoutLimitMax: 0,
  rollingReservePercent: 0,
  rollingReserveHoldDays: 0,
  rollingReserveCap: 0,
  payoutMinimumFeeMode: "overall",
  payoutMinimumFeeThresholdMillion: 0,
  payoutMinimumFeePerTransaction: 0,
  payoutMinimumFeeEuThresholdMillion: 0,
  payoutMinimumFeeEuPerTransaction: 0,
  payoutMinimumFeeWwThresholdMillion: 0,
  payoutMinimumFeeWwPerTransaction: 0
};

export const DEFAULT_CALCULATOR_STATE: CalculatorStatePreset = {
  calculatorType: DEFAULT_CALCULATOR_TYPE,
  payinVolume: 1_000_000,
  payinTransactions: 10_000,
  approvalRatioPercent: 80,
  euPercent: 80,
  ccPercent: 90,
  payoutVolume: 200_000,
  payoutTransactions: 2_000,
  introducerEnabled: false,
  introducerCommissionType: "standard",
  customTier1UpToMillion: DEFAULT_CUSTOM_TIER_SETTINGS.tier1UpToMillion,
  customTier2UpToMillion: DEFAULT_CUSTOM_TIER_SETTINGS.tier2UpToMillion,
  customTier1RatePerMillion: DEFAULT_CUSTOM_TIER_SETTINGS.tier1RatePerMillion,
  customTier2RatePerMillion: DEFAULT_CUSTOM_TIER_SETTINGS.tier2RatePerMillion,
  customTier3RatePerMillion: DEFAULT_CUSTOM_TIER_SETTINGS.tier3RatePerMillion,
  revSharePercent: 25,
  settlementIncluded: DEFAULT_SETTLEMENT_INCLUDED,
  payinEuPricing: DEFAULT_PAYIN_EU_PRICING_CONFIG,
  payinWwPricing: DEFAULT_PAYIN_WW_PRICING_CONFIG,
  payoutPricing: DEFAULT_PAYOUT_PRICING_CONFIG,
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
  failedTrxOverLimitThresholdPercent: DEFAULT_FAILED_TRX_CHARGING_CONFIG.overLimitThresholdPercent,
  contractSummarySettings: DEFAULT_CONTRACT_SUMMARY_SETTINGS,
  clientNotes: "",
  showHardcodedConstants: false,
  showZone3Formulas: false,
  showZone4Formulas: false,
  showUnifiedFormulas: true,
  unifiedExpandedById: {},
  zoneExpanded: INITIAL_ZONE_EXPANDED
};

export const ZERO_CALCULATOR_STATE: CalculatorStatePreset = {
  calculatorType: ZERO_CALCULATOR_TYPE,
  payinVolume: 0,
  payinTransactions: 0,
  approvalRatioPercent: 0,
  euPercent: 0,
  ccPercent: 0,
  payoutVolume: 0,
  payoutTransactions: 0,
  introducerEnabled: false,
  introducerCommissionType: "standard",
  customTier1UpToMillion: 0,
  customTier2UpToMillion: 0,
  customTier1RatePerMillion: 0,
  customTier2RatePerMillion: 0,
  customTier3RatePerMillion: 0,
  revSharePercent: 0,
  settlementIncluded: false,
  payinEuPricing: ZERO_PAYIN_REGION_PRICING_CONFIG,
  payinWwPricing: ZERO_PAYIN_REGION_PRICING_CONFIG,
  payoutPricing: ZERO_PAYOUT_PRICING_CONFIG,
  payoutMinimumFeeEnabled: false,
  payoutMinimumFeePerTransaction: 0,
  threeDsEnabled: false,
  threeDsRevenuePerSuccessfulTransaction: 0,
  settlementFeeEnabled: false,
  settlementFeeRatePercent: 0,
  monthlyMinimumFeeEnabled: false,
  monthlyMinimumFeeAmount: 0,
  failedTrxEnabled: false,
  failedTrxMode: "overLimitOnly",
  failedTrxOverLimitThresholdPercent: 0,
  contractSummarySettings: ZERO_CONTRACT_SUMMARY_SETTINGS,
  clientNotes: "",
  showHardcodedConstants: false,
  showZone3Formulas: false,
  showZone4Formulas: false,
  showUnifiedFormulas: true,
  unifiedExpandedById: {},
  zoneExpanded: INITIAL_ZONE_EXPANDED
};

export function clonePayinRegionPricingConfig(
  config: PayinRegionPricingConfig
): PayinRegionPricingConfig {
  return {
    ...config,
    single: { ...config.single },
    tiers: config.tiers.map(tier => ({ ...tier })) as PayinRegionPricingConfig["tiers"]
  };
}

export function clonePayoutPricingConfig(config: PayoutPricingConfig): PayoutPricingConfig {
  return {
    ...config,
    single: { ...config.single },
    tiers: config.tiers.map(tier => ({ ...tier })) as PayoutPricingConfig["tiers"]
  };
}

export function cloneContractSummarySettings(
  settings: ContractSummarySettings
): ContractSummarySettings {
  return { ...settings };
}
