export type PricingModelType = "icpp" | "blended";
export type PricingRateMode = "single" | "tiered";

export interface PayinRateSet {
  mdrPercent: number;
  trxCc: number;
  trxApm: number;
}

export interface PayoutRateSet {
  mdrPercent: number;
  trxFee: number;
}

export interface PayinRegionPricingConfig {
  model: PricingModelType;
  trxFeeEnabled: boolean;
  rateMode: PricingRateMode;
  tier1UpToMillion: number;
  tier2UpToMillion: number;
  single: PayinRateSet;
  tiers: [PayinRateSet, PayinRateSet, PayinRateSet];
  schemeFeesPercent: number;
  interchangePercent: number;
}

export interface PayoutPricingConfig {
  rateMode: PricingRateMode;
  tier1UpToMillion: number;
  tier2UpToMillion: number;
  single: PayoutRateSet;
  tiers: [PayoutRateSet, PayoutRateSet, PayoutRateSet];
}

export interface PayinRegionPricingPreviewInput {
  volume: number;
  averageTransaction: number;
  successful: {
    cc: number;
    apm: number;
  };
  methodVolume: {
    cc: number;
    apm: number;
  };
  config: PayinRegionPricingConfig;
}

export interface PayoutPricingPreviewInput {
  volume: number;
  averageTransaction: number;
  totalTransactions: number;
  config: PayoutPricingConfig;
}

export interface PayinTierRevenueBreakdown {
  label: string;
  volume: number;
  mdrPercent: number;
  mdrRevenue: number;
  ccTransactions: number;
  apmTransactions: number;
  trxCc: number;
  trxApm: number;
  trxRevenue: number;
  totalRevenue: number;
}

export interface PayoutTierRevenueBreakdown {
  label: string;
  volume: number;
  configuredMdrPercent: number;
  appliedMdrPercent: number;
  mdrMinimumApplied: boolean;
  mdrPercent: number;
  mdrRevenue: number;
  transactions: number;
  configuredTrxFee: number;
  appliedTrxFee: number;
  trxMinimumApplied: boolean;
  trxFee: number;
  trxRevenue: number;
  totalRevenue: number;
}

export interface PayoutRateMinimumAdjustment {
  scopeLabel: string;
  configuredMdrPercent: number;
  appliedMdrPercent: number;
  mdrMinimumApplied: boolean;
  configuredTrxFee: number;
  appliedTrxFee: number;
  trxMinimumApplied: boolean;
}

export interface PayinRegionPricingPreview {
  mdrRevenue: number;
  trxRevenue: number;
  totalRevenue: number;
  schemeCostImpact: number;
  revenueAfterSchemePreview: number;
  tierRows: [PayinTierRevenueBreakdown, PayinTierRevenueBreakdown, PayinTierRevenueBreakdown] | [];
  warnings: string[];
}

export interface PayoutPricingPreview {
  mdrRevenue: number;
  trxRevenue: number;
  totalRevenue: number;
  tierRows: [PayoutTierRevenueBreakdown, PayoutTierRevenueBreakdown, PayoutTierRevenueBreakdown] | [];
  minimumAdjustments: PayoutRateMinimumAdjustment[];
  singleRateMinimumAdjustment: PayoutRateMinimumAdjustment | null;
  warnings: string[];
}

export const DEFAULT_SETTLEMENT_INCLUDED = false;

export const DEFAULT_PAYIN_EU_PRICING_CONFIG: PayinRegionPricingConfig = {
  model: "blended",
  trxFeeEnabled: true,
  rateMode: "single",
  tier1UpToMillion: 5,
  tier2UpToMillion: 10,
  single: {
    mdrPercent: 4.5,
    trxCc: 0.35,
    trxApm: 0.35
  },
  tiers: [
    { mdrPercent: 4.5, trxCc: 0.35, trxApm: 0.35 },
    { mdrPercent: 4.25, trxCc: 0.3, trxApm: 0.35 },
    { mdrPercent: 4.0, trxCc: 0.25, trxApm: 0.35 }
  ],
  schemeFeesPercent: 0.75,
  interchangePercent: 0.75
};

export const DEFAULT_PAYIN_WW_PRICING_CONFIG: PayinRegionPricingConfig = {
  model: "icpp",
  trxFeeEnabled: true,
  rateMode: "single",
  tier1UpToMillion: 5,
  tier2UpToMillion: 10,
  single: {
    mdrPercent: 5.0,
    trxCc: 0.35,
    trxApm: 0.35
  },
  tiers: [
    { mdrPercent: 5.0, trxCc: 0.35, trxApm: 0.35 },
    { mdrPercent: 4.75, trxCc: 0.3, trxApm: 0.35 },
    { mdrPercent: 4.5, trxCc: 0.25, trxApm: 0.35 }
  ],
  schemeFeesPercent: 2,
  interchangePercent: 2
};

export const DEFAULT_PAYOUT_PRICING_CONFIG: PayoutPricingConfig = {
  rateMode: "single",
  tier1UpToMillion: 1,
  tier2UpToMillion: 5,
  single: {
    mdrPercent: 2.0,
    trxFee: 0.5
  },
  tiers: [
    { mdrPercent: 2.0, trxFee: 0.5 },
    { mdrPercent: 1.8, trxFee: 0.45 },
    { mdrPercent: 1.5, trxFee: 0.4 }
  ]
};

export const PAYOUT_MDR_MIN_PERCENT = 1.3;
export const PAYOUT_MDR_MAX_PERCENT = 5;
export const PAYOUT_TRX_MIN_FEE = 0.2;
export const PAYOUT_TRX_LOW_WARNING_FEE = 0.4;

function safeNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function normalizeBoundaries(
  tier1UpToMillion: number,
  tier2UpToMillion: number
): { tier1: number; tier2: number } {
  const tier1 = Math.min(25, Math.max(0, safeNonNegative(tier1UpToMillion)));
  const tier2 = Math.min(25, Math.max(tier1, safeNonNegative(tier2UpToMillion)));
  return { tier1, tier2 };
}

function splitVolumeByTiers(
  volume: number,
  tier1UpToMillion: number,
  tier2UpToMillion: number
): [number, number, number] {
  const normalizedVolume = safeNonNegative(volume);
  const { tier1, tier2 } = normalizeBoundaries(tier1UpToMillion, tier2UpToMillion);
  const tier1Cap = tier1 * 1_000_000;
  const tier2Cap = tier2 * 1_000_000;

  const tier1Volume = Math.min(normalizedVolume, tier1Cap);
  const tier2Volume = Math.max(0, Math.min(normalizedVolume, tier2Cap) - tier1Cap);
  const tier3Volume = Math.max(0, normalizedVolume - tier2Cap);
  return [tier1Volume, tier2Volume, tier3Volume];
}

function buildTierLabels(tier1UpToMillion: number, tier2UpToMillion: number): [string, string, string] {
  const { tier1, tier2 } = normalizeBoundaries(tier1UpToMillion, tier2UpToMillion);
  return [
    `Tier 1 (€0-€${tier1}M)`,
    `Tier 2 (€${tier1}M-€${tier2}M)`,
    `Tier 3 (>€${tier2}M)`
  ];
}

function applyPayoutRateMinimums(
  rateSet: PayoutRateSet,
  scopeLabel: string
): PayoutRateMinimumAdjustment {
  const configuredMdrPercent = safeNonNegative(rateSet.mdrPercent);
  const configuredTrxFee = safeNonNegative(rateSet.trxFee);
  const appliedMdrPercent = Math.max(PAYOUT_MDR_MIN_PERCENT, configuredMdrPercent);
  const appliedTrxFee = Math.max(PAYOUT_TRX_MIN_FEE, configuredTrxFee);

  return {
    scopeLabel,
    configuredMdrPercent,
    appliedMdrPercent,
    mdrMinimumApplied: configuredMdrPercent < PAYOUT_MDR_MIN_PERCENT,
    configuredTrxFee,
    appliedTrxFee,
    trxMinimumApplied: configuredTrxFee < PAYOUT_TRX_MIN_FEE
  };
}

export function collectPayinPricingWarnings(config: PayinRegionPricingConfig): string[] {
  const mdrRates =
    config.rateMode === "single"
      ? [safeNonNegative(config.single.mdrPercent)]
      : config.tiers.map(rate => safeNonNegative(rate.mdrPercent));

  const warnings: string[] = [];

  if (mdrRates.some(rate => rate < 2.5)) {
    warnings.push("⚠️ Low rate - please verify agreement");
  }

  if (mdrRates.some(rate => rate > 10)) {
    warnings.push("⚠️ MDR above 10% is outside allowed range");
  }

  return warnings;
}

export function collectPayoutPricingWarnings(config: PayoutPricingConfig): string[] {
  const mdrRates =
    config.rateMode === "single"
      ? [safeNonNegative(config.single.mdrPercent)]
      : config.tiers.map(rate => safeNonNegative(rate.mdrPercent));

  const trxRates =
    config.rateMode === "single"
      ? [safeNonNegative(config.single.trxFee)]
      : config.tiers.map(rate => safeNonNegative(rate.trxFee));

  const warnings: string[] = [];

  if (mdrRates.some(rate => rate < PAYOUT_MDR_MIN_PERCENT)) {
    warnings.push(`⚠️ Payout MDR below ${PAYOUT_MDR_MIN_PERCENT}% minimum`);
  }

  if (mdrRates.some(rate => rate > PAYOUT_MDR_MAX_PERCENT)) {
    warnings.push(`⚠️ Payout MDR above ${PAYOUT_MDR_MAX_PERCENT}% maximum`);
  }

  if (trxRates.some(rate => rate < PAYOUT_TRX_MIN_FEE)) {
    warnings.push(`⚠️ Payout TRX fee below €${PAYOUT_TRX_MIN_FEE.toFixed(2)} minimum`);
  }

  if (trxRates.some(rate => rate < PAYOUT_TRX_LOW_WARNING_FEE)) {
    warnings.push(`⚠️ Low payout TRX fee (< €${PAYOUT_TRX_LOW_WARNING_FEE.toFixed(2)})`);
  }

  return warnings;
}

export function calculatePayinRegionPricingPreview(
  input: PayinRegionPricingPreviewInput
): PayinRegionPricingPreview {
  const volume = safeNonNegative(input.volume);
  const averageTransaction = safeNonNegative(input.averageTransaction);
  const successfulCc = safeNonNegative(input.successful.cc);
  const successfulApm = safeNonNegative(input.successful.apm);
  const methodVolumeCc = safeNonNegative(input.methodVolume.cc);
  const methodVolumeApm = safeNonNegative(input.methodVolume.apm);
  const warnings = collectPayinPricingWarnings(input.config);
  const schemeCostImpact =
    input.config.model === "blended"
      ? volume * (safeNonNegative(input.config.schemeFeesPercent) / 100)
      : 0;

  if (input.config.rateMode === "single") {
    const mdrRevenue = volume * (safeNonNegative(input.config.single.mdrPercent) / 100);
    const trxRevenue = input.config.trxFeeEnabled
      ? successfulCc * safeNonNegative(input.config.single.trxCc) +
        successfulApm * safeNonNegative(input.config.single.trxApm)
      : 0;

    return {
      mdrRevenue,
      trxRevenue,
      totalRevenue: mdrRevenue + trxRevenue,
      schemeCostImpact,
      revenueAfterSchemePreview: mdrRevenue + trxRevenue - schemeCostImpact,
      tierRows: [],
      warnings
    };
  }

  const [tier1Volume, tier2Volume, tier3Volume] = splitVolumeByTiers(
    volume,
    input.config.tier1UpToMillion,
    input.config.tier2UpToMillion
  );
  const labels = buildTierLabels(input.config.tier1UpToMillion, input.config.tier2UpToMillion);
  const volumes: [number, number, number] = [tier1Volume, tier2Volume, tier3Volume];

  const ccShare = volume > 0 ? methodVolumeCc / volume : 0;
  const apmShare = volume > 0 ? methodVolumeApm / volume : 0;

  const rows = volumes.map((tierVolume, index) => {
    const rates = input.config.tiers[index];
    const mdrRevenue = tierVolume * (safeNonNegative(rates.mdrPercent) / 100);

    const tierCcVolume = tierVolume * ccShare;
    const tierApmVolume = tierVolume * apmShare;
    const ccTransactions = averageTransaction > 0 ? tierCcVolume / averageTransaction : 0;
    const apmTransactions = averageTransaction > 0 ? tierApmVolume / averageTransaction : 0;
    const trxRevenue = input.config.trxFeeEnabled
      ? ccTransactions * safeNonNegative(rates.trxCc) +
        apmTransactions * safeNonNegative(rates.trxApm)
      : 0;

    const row: PayinTierRevenueBreakdown = {
      label: labels[index],
      volume: tierVolume,
      mdrPercent: safeNonNegative(rates.mdrPercent),
      mdrRevenue,
      ccTransactions,
      apmTransactions,
      trxCc: safeNonNegative(rates.trxCc),
      trxApm: safeNonNegative(rates.trxApm),
      trxRevenue,
      totalRevenue: mdrRevenue + trxRevenue
    };

    return row;
  }) as [PayinTierRevenueBreakdown, PayinTierRevenueBreakdown, PayinTierRevenueBreakdown];

  const mdrRevenue = rows.reduce((sum, row) => sum + row.mdrRevenue, 0);
  const trxRevenue = rows.reduce((sum, row) => sum + row.trxRevenue, 0);

  return {
    mdrRevenue,
    trxRevenue,
    totalRevenue: mdrRevenue + trxRevenue,
    schemeCostImpact,
    revenueAfterSchemePreview: mdrRevenue + trxRevenue - schemeCostImpact,
    tierRows: rows,
    warnings
  };
}

export function calculatePayoutPricingPreview(
  input: PayoutPricingPreviewInput
): PayoutPricingPreview {
  const volume = safeNonNegative(input.volume);
  const averageTransaction = safeNonNegative(input.averageTransaction);
  const totalTransactions = safeNonNegative(input.totalTransactions);
  const warnings = collectPayoutPricingWarnings(input.config);

  if (input.config.rateMode === "single") {
    const adjustment = applyPayoutRateMinimums(input.config.single, "Single Rate");
    const mdrRevenue = volume * (adjustment.appliedMdrPercent / 100);
    const trxRevenue = totalTransactions * adjustment.appliedTrxFee;

    return {
      mdrRevenue,
      trxRevenue,
      totalRevenue: mdrRevenue + trxRevenue,
      tierRows: [],
      minimumAdjustments: [adjustment],
      singleRateMinimumAdjustment: adjustment,
      warnings
    };
  }

  const [tier1Volume, tier2Volume, tier3Volume] = splitVolumeByTiers(
    volume,
    input.config.tier1UpToMillion,
    input.config.tier2UpToMillion
  );
  const labels = buildTierLabels(input.config.tier1UpToMillion, input.config.tier2UpToMillion);
  const volumes: [number, number, number] = [tier1Volume, tier2Volume, tier3Volume];

  const rowsWithAdjustments = volumes.map((tierVolume, index) => {
    const adjustment = applyPayoutRateMinimums(input.config.tiers[index], labels[index]);
    const mdrRevenue = tierVolume * (adjustment.appliedMdrPercent / 100);
    const transactions = averageTransaction > 0 ? tierVolume / averageTransaction : 0;
    const trxRevenue = transactions * adjustment.appliedTrxFee;

    const row: PayoutTierRevenueBreakdown = {
      label: labels[index],
      volume: tierVolume,
      configuredMdrPercent: adjustment.configuredMdrPercent,
      appliedMdrPercent: adjustment.appliedMdrPercent,
      mdrMinimumApplied: adjustment.mdrMinimumApplied,
      mdrPercent: adjustment.appliedMdrPercent,
      mdrRevenue,
      transactions,
      configuredTrxFee: adjustment.configuredTrxFee,
      appliedTrxFee: adjustment.appliedTrxFee,
      trxMinimumApplied: adjustment.trxMinimumApplied,
      trxFee: adjustment.appliedTrxFee,
      trxRevenue,
      totalRevenue: mdrRevenue + trxRevenue
    };

    return { row, adjustment };
  });
  const rows = rowsWithAdjustments.map(item => item.row) as [
    PayoutTierRevenueBreakdown,
    PayoutTierRevenueBreakdown,
    PayoutTierRevenueBreakdown
  ];
  const minimumAdjustments = rowsWithAdjustments.map(item => item.adjustment);

  const mdrRevenue = rows.reduce((sum, row) => sum + row.mdrRevenue, 0);
  const trxRevenue = rows.reduce((sum, row) => sum + row.trxRevenue, 0);

  return {
    mdrRevenue,
    trxRevenue,
    totalRevenue: mdrRevenue + trxRevenue,
    tierRows: rows,
    minimumAdjustments,
    singleRateMinimumAdjustment: null,
    warnings
  };
}
