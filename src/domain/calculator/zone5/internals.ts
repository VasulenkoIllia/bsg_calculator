import {
  DEFAULT_PROVIDER_PAYOUT_MDR_TIERS,
  DEFAULT_PROVIDER_PAYOUT_TRX_TIERS,
  EURO_PER_MILLION
} from "./constants.js";
import type { ProviderTierConfig, TierPercentCostRow, TierTrxCostRow } from "./types.js";

export function safeNonNegative(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

export function safeFinite(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value;
}

export function normalizePercent(value: number): number {
  return safeNonNegative(value);
}

export function normalizeTierBoundaries(
  tier1UpToMillion: number,
  tier2UpToMillion: number
): { tier1: number; tier2: number } {
  const tier1 = Math.max(0, safeNonNegative(tier1UpToMillion));
  const tier2 = Math.max(tier1, safeNonNegative(tier2UpToMillion));
  return { tier1, tier2 };
}

export function splitVolumeByTier(
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

export function buildTierLabels(
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

export function calculateProviderMdrRows(
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

export function distributeProviderMdrRowsByShare(
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

export function sumCosts(rows: { cost: number }[]): number {
  return rows.reduce((sum, row) => sum + row.cost, 0);
}

export function calculatePayoutProviderTrxRows(
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
