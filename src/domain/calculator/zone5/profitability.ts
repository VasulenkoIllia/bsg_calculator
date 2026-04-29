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

const EURO_PER_MILLION = 1_000_000;

export const DEFAULT_PROVIDER_PAYIN_MDR_TIERS: ProviderTierConfig = {
  tier1UpToMillion: 10,
  tier2UpToMillion: 25,
  tier1Rate: 1.7,
  tier2Rate: 1.5,
  tier3Rate: 1.4
};

export const DEFAULT_PROVIDER_PAYOUT_MDR_TIERS: ProviderTierConfig = {
  tier1UpToMillion: 10,
  tier2UpToMillion: 25,
  tier1Rate: 1.0,
  tier2Rate: 1.0,
  tier3Rate: 1.0
};

export const DEFAULT_PROVIDER_PAYOUT_TRX_TIERS: {
  tier1Fee: number;
  tier2Fee: number;
  tier3Fee: number;
} = {
  tier1Fee: 0.4,
  tier2Fee: 0.4,
  tier3Fee: 0.4
};

export const DEFAULT_PROVIDER_PAYIN_TRX_CC_COST = 0.22;
export const DEFAULT_PROVIDER_PAYIN_TRX_APM_COST = 0.27;

function safeNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function safeFinite(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value;
}

function normalizePercent(value: number): number {
  return safeNonNegative(value);
}

function normalizeTierBoundaries(
  tier1UpToMillion: number,
  tier2UpToMillion: number
): { tier1: number; tier2: number } {
  const tier1 = Math.max(0, safeNonNegative(tier1UpToMillion));
  const tier2 = Math.max(tier1, safeNonNegative(tier2UpToMillion));
  return { tier1, tier2 };
}

function splitVolumeByTier(
  volume: number,
  tier1UpToMillion: number,
  tier2UpToMillion: number
): [number, number, number] {
  const safeVolume = safeNonNegative(volume);
  const { tier1, tier2 } = normalizeTierBoundaries(tier1UpToMillion, tier2UpToMillion);
  const tier1Cap = tier1 * EURO_PER_MILLION;
  const tier2Cap = tier2 * EURO_PER_MILLION;

  const tier1Volume = Math.min(safeVolume, tier1Cap);
  const tier2Volume = Math.max(0, Math.min(safeVolume, tier2Cap) - tier1Cap);
  const tier3Volume = Math.max(0, safeVolume - tier2Cap);

  return [tier1Volume, tier2Volume, tier3Volume];
}

function buildTierLabels(
  tier1UpToMillion: number,
  tier2UpToMillion: number
): [string, string, string] {
  const { tier1, tier2 } = normalizeTierBoundaries(tier1UpToMillion, tier2UpToMillion);
  return [
    `Tier 1 (€0-€${tier1}M)`,
    `Tier 2 (€${tier1}M-€${tier2}M)`,
    `Tier 3 (>€${tier2}M)`
  ];
}

function calculateProviderMdrRows(
  volume: number,
  tiers: ProviderTierConfig
): [TierPercentCostRow, TierPercentCostRow, TierPercentCostRow] {
  const [tier1Volume, tier2Volume, tier3Volume] = splitVolumeByTier(
    volume,
    tiers.tier1UpToMillion,
    tiers.tier2UpToMillion
  );
  const [label1, label2, label3] = buildTierLabels(tiers.tier1UpToMillion, tiers.tier2UpToMillion);

  return [
    {
      label: label1,
      volume: tier1Volume,
      ratePercent: normalizePercent(tiers.tier1Rate),
      cost: tier1Volume * (normalizePercent(tiers.tier1Rate) / 100)
    },
    {
      label: label2,
      volume: tier2Volume,
      ratePercent: normalizePercent(tiers.tier2Rate),
      cost: tier2Volume * (normalizePercent(tiers.tier2Rate) / 100)
    },
    {
      label: label3,
      volume: tier3Volume,
      ratePercent: normalizePercent(tiers.tier3Rate),
      cost: tier3Volume * (normalizePercent(tiers.tier3Rate) / 100)
    }
  ];
}

function distributeProviderMdrRowsByShare(
  rows: [TierPercentCostRow, TierPercentCostRow, TierPercentCostRow],
  share: number
): [TierPercentCostRow, TierPercentCostRow, TierPercentCostRow] {
  const safeShare = Math.max(0, Math.min(1, safeNonNegative(share)));
  const allocate = (row: TierPercentCostRow): TierPercentCostRow => ({
    ...row,
    volume: row.volume * safeShare,
    cost: row.cost * safeShare
  });

  return [allocate(rows[0]), allocate(rows[1]), allocate(rows[2])];
}

function sumCosts(rows: { cost: number }[]): number {
  return rows.reduce((sum, row) => sum + row.cost, 0);
}

function calculatePayoutProviderTrxRows(
  volume: number,
  totalTransactions: number
): [TierTrxCostRow, TierTrxCostRow, TierTrxCostRow] {
  const [tier1Volume, tier2Volume, tier3Volume] = splitVolumeByTier(
    volume,
    DEFAULT_PROVIDER_PAYOUT_MDR_TIERS.tier1UpToMillion,
    DEFAULT_PROVIDER_PAYOUT_MDR_TIERS.tier2UpToMillion
  );
  const [label1, label2, label3] = buildTierLabels(
    DEFAULT_PROVIDER_PAYOUT_MDR_TIERS.tier1UpToMillion,
    DEFAULT_PROVIDER_PAYOUT_MDR_TIERS.tier2UpToMillion
  );
  const safeVolume = safeNonNegative(volume);
  const safeTotalTransactions = safeNonNegative(totalTransactions);

  const shareOfVolume = (tierVolume: number): number =>
    safeVolume > 0 ? tierVolume / safeVolume : 0;

  const tier1Transactions = safeTotalTransactions * shareOfVolume(tier1Volume);
  const tier2Transactions = safeTotalTransactions * shareOfVolume(tier2Volume);
  const tier3Transactions = safeTotalTransactions * shareOfVolume(tier3Volume);

  return [
    {
      label: label1,
      volume: tier1Volume,
      transactions: tier1Transactions,
      feePerTransaction: DEFAULT_PROVIDER_PAYOUT_TRX_TIERS.tier1Fee,
      cost: tier1Transactions * DEFAULT_PROVIDER_PAYOUT_TRX_TIERS.tier1Fee
    },
    {
      label: label2,
      volume: tier2Volume,
      transactions: tier2Transactions,
      feePerTransaction: DEFAULT_PROVIDER_PAYOUT_TRX_TIERS.tier2Fee,
      cost: tier2Transactions * DEFAULT_PROVIDER_PAYOUT_TRX_TIERS.tier2Fee
    },
    {
      label: label3,
      volume: tier3Volume,
      transactions: tier3Transactions,
      feePerTransaction: DEFAULT_PROVIDER_PAYOUT_TRX_TIERS.tier3Fee,
      cost: tier3Transactions * DEFAULT_PROVIDER_PAYOUT_TRX_TIERS.tier3Fee
    }
  ];
}

export function calculatePayinRegionProfitability(
  input: PayinRegionProfitabilityInput
): PayinRegionProfitability {
  const volume = safeNonNegative(input.volume);
  const mdrRevenue = safeNonNegative(input.mdrRevenue);
  const trxRevenue = safeNonNegative(input.trxRevenue);
  const failedTrxRevenue = safeNonNegative(input.failedTrxRevenue);
  const attemptsCc = safeNonNegative(input.attemptsCcTransactions);
  const attemptsApm = safeNonNegative(input.attemptsApmTransactions);

  const providerMdrRows = calculateProviderMdrRows(volume, DEFAULT_PROVIDER_PAYIN_MDR_TIERS);
  const providerMdr = sumCosts(providerMdrRows);

  const providerTrxCcCost = safeNonNegative(
    input.providerTrxCcCost ?? DEFAULT_PROVIDER_PAYIN_TRX_CC_COST
  );
  const providerTrxApmCost = safeNonNegative(
    input.providerTrxApmCost ?? DEFAULT_PROVIDER_PAYIN_TRX_APM_COST
  );
  const providerTrxCcTotal = attemptsCc * providerTrxCcCost;
  const providerTrxApmTotal = attemptsApm * providerTrxApmCost;
  const providerTrx = providerTrxCcTotal + providerTrxApmTotal;

  // Scheme fees are applied only for Blended.
  const schemeFees =
    input.pricingModel === "blended"
      ? volume * (normalizePercent(input.schemeFeesPercent) / 100)
      : 0;
  // Product correction (2026-04-29): interchange is not a payin cost component.
  // Keep the field for compatibility in API shape, but exclude it from calculations.
  const interchange = 0;

  const revenueTotal = mdrRevenue + trxRevenue + failedTrxRevenue;
  const costsTotal = providerMdr + providerTrx + schemeFees;

  return {
    revenue: {
      mdr: mdrRevenue,
      trx: trxRevenue,
      failedTrx: failedTrxRevenue,
      total: revenueTotal
    },
    costs: {
      providerMdr,
      providerTrx,
      schemeFees,
      interchange,
      total: costsTotal
    },
    providerMdrRows,
    providerTrxBreakdown: {
      attemptsCc,
      attemptsApm,
      ccCost: providerTrxCcTotal,
      apmCost: providerTrxApmTotal,
      total: providerTrx
    },
    netMargin: revenueTotal - costsTotal
  };
}

export function calculatePayinProfitability(
  input: PayinProfitabilityInput
): PayinProfitabilityResult {
  const euBase = calculatePayinRegionProfitability(input.eu);
  const wwBase = calculatePayinRegionProfitability(input.ww);

  const euVolume = safeNonNegative(input.eu.volume);
  const wwVolume = safeNonNegative(input.ww.volume);
  const totalPayinVolume = euVolume + wwVolume;

  // Product correction (2026-04-29): provider MDR tiers are applied on TOTAL payin volume first,
  // then allocated back to EU/WW by volume share for regional transparency.
  const totalProviderMdrRows = calculateProviderMdrRows(
    totalPayinVolume,
    DEFAULT_PROVIDER_PAYIN_MDR_TIERS
  );
  const euShare = totalPayinVolume > 0 ? euVolume / totalPayinVolume : 0;
  const wwShare = totalPayinVolume > 0 ? wwVolume / totalPayinVolume : 0;
  const euProviderMdrRows = distributeProviderMdrRowsByShare(totalProviderMdrRows, euShare);
  const wwProviderMdrRows = distributeProviderMdrRowsByShare(totalProviderMdrRows, wwShare);

  const euProviderMdr = sumCosts(euProviderMdrRows);
  const wwProviderMdr = sumCosts(wwProviderMdrRows);

  const euCosts = {
    providerMdr: euProviderMdr,
    providerTrx: euBase.costs.providerTrx,
    schemeFees: euBase.costs.schemeFees,
    interchange: 0,
    total: euProviderMdr + euBase.costs.providerTrx + euBase.costs.schemeFees
  };
  const wwCosts = {
    providerMdr: wwProviderMdr,
    providerTrx: wwBase.costs.providerTrx,
    schemeFees: wwBase.costs.schemeFees,
    interchange: 0,
    total: wwProviderMdr + wwBase.costs.providerTrx + wwBase.costs.schemeFees
  };

  const eu: PayinRegionProfitability = {
    ...euBase,
    providerMdrRows: euProviderMdrRows,
    costs: euCosts,
    netMargin: euBase.revenue.total - euCosts.total
  };
  const ww: PayinRegionProfitability = {
    ...wwBase,
    providerMdrRows: wwProviderMdrRows,
    costs: wwCosts,
    netMargin: wwBase.revenue.total - wwCosts.total
  };

  const revenue = {
    mdr: eu.revenue.mdr + ww.revenue.mdr,
    trx: eu.revenue.trx + ww.revenue.trx,
    failedTrx: eu.revenue.failedTrx + ww.revenue.failedTrx,
    total: eu.revenue.total + ww.revenue.total
  };
  const costs = {
    providerMdr: eu.costs.providerMdr + ww.costs.providerMdr,
    providerTrx: eu.costs.providerTrx + ww.costs.providerTrx,
    schemeFees: eu.costs.schemeFees + ww.costs.schemeFees,
    interchange: eu.costs.interchange + ww.costs.interchange,
    total: eu.costs.total + ww.costs.total
  };

  return {
    eu,
    ww,
    revenue,
    costs,
    netMargin: revenue.total - costs.total
  };
}

export function calculatePayoutProfitability(
  input: PayoutProfitabilityInput
): PayoutProfitabilityResult {
  const volume = safeNonNegative(input.volume);
  const totalTransactions = safeNonNegative(input.totalTransactions);
  const mdrRevenue = safeNonNegative(input.mdrRevenue);
  const trxRevenue = safeNonNegative(input.trxRevenue);

  const providerMdrRows = calculateProviderMdrRows(volume, DEFAULT_PROVIDER_PAYOUT_MDR_TIERS);
  const providerMdr = sumCosts(providerMdrRows);

  const providerTrxRows = calculatePayoutProviderTrxRows(volume, totalTransactions);
  const providerTrx = sumCosts(providerTrxRows);

  const revenueTotal = mdrRevenue + trxRevenue;
  const costsTotal = providerMdr + providerTrx;

  return {
    revenue: {
      mdr: mdrRevenue,
      trx: trxRevenue,
      total: revenueTotal
    },
    costs: {
      providerMdr,
      providerTrx,
      total: costsTotal
    },
    providerMdrRows,
    providerTrxRows,
    netMargin: revenueTotal - costsTotal
  };
}

export function calculateOtherRevenueProfitability(
  input: OtherRevenueProfitabilityInput
): OtherRevenueProfitabilityResult {
  const threeDsRevenue = safeNonNegative(input.threeDsRevenue);
  const threeDsCost = safeNonNegative(input.threeDsCost);
  const settlementFee = safeFinite(input.settlementFeeRevenue);
  const monthlyMinimumAdjustment = safeNonNegative(input.monthlyMinimumAdjustment);

  const revenueTotal = threeDsRevenue + settlementFee + monthlyMinimumAdjustment;
  const costsTotal = threeDsCost;

  return {
    revenue: {
      threeDs: threeDsRevenue,
      settlementFee,
      monthlyMinimumAdjustment,
      total: revenueTotal
    },
    costs: {
      threeDs: threeDsCost,
      total: costsTotal
    },
    netMargin: revenueTotal - costsTotal
  };
}

export function calculateTotalProfitability(
  input: TotalProfitabilityInput
): TotalProfitabilityResult {
  const payinNetMargin = safeFinite(input.payin.netMargin);
  const payoutNetMargin = safeFinite(input.payout.netMargin);
  const otherNetMargin = safeFinite(input.other.netMargin);

  const totalRevenue =
    safeNonNegative(input.payin.revenue.total) +
    safeNonNegative(input.payout.revenue.total) +
    safeNonNegative(input.other.revenue.total);
  const totalCosts =
    safeNonNegative(input.payin.costs.total) +
    safeNonNegative(input.payout.costs.total) +
    safeNonNegative(input.other.costs.total);
  const marginBeforeIntroducer = payinNetMargin + payoutNetMargin + otherNetMargin;

  if (!input.introducerEnabled) {
    return {
      mode: "disabled",
      payinNetMargin,
      payoutNetMargin,
      otherNetMargin,
      totalRevenue,
      totalCosts,
      marginBeforeIntroducer,
      introducerCommission: 0,
      revSharePercentApplied: 0,
      ourMargin: marginBeforeIntroducer,
      warning:
        marginBeforeIntroducer < 0
          ? "⚠️ Negative Margin: Costs exceed revenue. Please review pricing structure."
          : null
    };
  }

  if (input.introducerCommissionType === "revShare") {
    const revSharePercentApplied = Math.max(0, Math.min(50, input.revSharePercent));
    // Product decision: introducer applies to Payin flow only.
    const introducerCommission = payinNetMargin * (revSharePercentApplied / 100);
    const ourMargin = marginBeforeIntroducer - introducerCommission;

    return {
      mode: "revShare",
      payinNetMargin,
      payoutNetMargin,
      otherNetMargin,
      totalRevenue,
      totalCosts,
      marginBeforeIntroducer,
      introducerCommission,
      revSharePercentApplied,
      ourMargin,
      warning:
        ourMargin < 0
          ? "⚠️ Negative Margin: Costs exceed revenue. Please review pricing structure."
          : null
    };
  }

  const introducerCommission = safeNonNegative(input.introducerCommissionAmount);
  const ourMargin = marginBeforeIntroducer - introducerCommission;

  return {
    mode: "standardCustom",
    payinNetMargin,
    payoutNetMargin,
    otherNetMargin,
    totalRevenue,
    totalCosts,
    marginBeforeIntroducer,
    introducerCommission,
    revSharePercentApplied: 0,
    ourMargin,
    warning:
      ourMargin < 0
        ? "⚠️ Negative Margin: Costs exceed revenue. Please review pricing structure."
        : null
  };
}
