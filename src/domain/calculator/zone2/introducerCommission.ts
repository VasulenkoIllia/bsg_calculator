export type IntroducerCommissionType = "standard" | "custom" | "revShare";

export interface StandardTierConfig {
  label: string;
  upToMillion: number | null;
  ratePerMillion: number;
}

export interface StandardCommissionResult {
  type: "standard";
  volumeEuro: number;
  volumeMillion: number;
  appliedTier: StandardTierConfig;
  totalCommission: number;
}

export interface CustomTierConfig {
  label: string;
  fromMillion: number;
  toMillion: number | null;
  ratePerMillion: number;
}

export interface CustomTierBreakdown {
  tier: CustomTierConfig;
  volumeMillionInTier: number;
  commission: number;
}

export interface CustomCommissionResult {
  type: "custom";
  volumeEuro: number;
  volumeMillion: number;
  tiers: [CustomTierBreakdown, CustomTierBreakdown, CustomTierBreakdown];
  totalCommission: number;
}

export interface RevShareInput {
  totalRevenue: number;
  totalCosts: number;
  sharePercent: number;
}

export interface RevShareResult {
  type: "revShare";
  totalRevenue: number;
  totalCosts: number;
  sharePercent: number;
  marginBeforeSplit: number;
  partnerShare: number;
  ourMargin: number;
}

export const DEFAULT_STANDARD_TIERS: readonly [
  StandardTierConfig,
  StandardTierConfig,
  StandardTierConfig
] = [
  { label: "Tier 1 (€0-€10M)", upToMillion: 10, ratePerMillion: 2_500 },
  { label: "Tier 2 (€10M-€25M)", upToMillion: 25, ratePerMillion: 5_000 },
  { label: "Tier 3 (>€25M)", upToMillion: null, ratePerMillion: 7_500 }
] as const;

export interface CustomTierSettings {
  tier1UpToMillion: number;
  tier2UpToMillion: number;
  tier1RatePerMillion: number;
  tier2RatePerMillion: number;
  tier3RatePerMillion: number;
}

export const DEFAULT_CUSTOM_TIER_SETTINGS: CustomTierSettings = {
  tier1UpToMillion: 10,
  tier2UpToMillion: 25,
  tier1RatePerMillion: 2_500,
  tier2RatePerMillion: 5_000,
  tier3RatePerMillion: 7_500
};

function normalizeEuroAmount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, value);
}

function normalizeSharePercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 50) return 50;
  return value;
}

function toMillion(valueEuro: number): number {
  return valueEuro / 1_000_000;
}

function resolveStandardTier(volumeMillion: number): StandardTierConfig {
  if (volumeMillion <= DEFAULT_STANDARD_TIERS[0].upToMillion!) {
    return DEFAULT_STANDARD_TIERS[0];
  }

  if (volumeMillion <= DEFAULT_STANDARD_TIERS[1].upToMillion!) {
    return DEFAULT_STANDARD_TIERS[1];
  }

  return DEFAULT_STANDARD_TIERS[2];
}

export function calculateStandardIntroducerCommission(
  volumeEuro: number
): StandardCommissionResult {
  const normalizedVolumeEuro = normalizeEuroAmount(volumeEuro);
  const volumeMillion = toMillion(normalizedVolumeEuro);
  const appliedTier = resolveStandardTier(volumeMillion);
  const totalCommission = volumeMillion * appliedTier.ratePerMillion;

  return {
    type: "standard",
    volumeEuro: normalizedVolumeEuro,
    volumeMillion,
    appliedTier,
    totalCommission
  };
}

function buildCustomTiers(settings: CustomTierSettings): [
  CustomTierConfig,
  CustomTierConfig,
  CustomTierConfig
] {
  const tier1UpToMillion = Math.max(0, settings.tier1UpToMillion);
  const tier2UpToMillion = Math.max(tier1UpToMillion, settings.tier2UpToMillion);

  return [
    {
      label: `Tier 1 (€0-€${tier1UpToMillion}M)`,
      fromMillion: 0,
      toMillion: tier1UpToMillion,
      ratePerMillion: Math.max(0, settings.tier1RatePerMillion)
    },
    {
      label: `Tier 2 (€${tier1UpToMillion}M-€${tier2UpToMillion}M)`,
      fromMillion: tier1UpToMillion,
      toMillion: tier2UpToMillion,
      ratePerMillion: Math.max(0, settings.tier2RatePerMillion)
    },
    {
      label: `Tier 3 (>€${tier2UpToMillion}M)`,
      fromMillion: tier2UpToMillion,
      toMillion: null,
      ratePerMillion: Math.max(0, settings.tier3RatePerMillion)
    }
  ];
}

function volumeInTier(volumeMillion: number, tier: CustomTierConfig): number {
  if (volumeMillion <= tier.fromMillion) {
    return 0;
  }

  if (tier.toMillion === null) {
    return volumeMillion - tier.fromMillion;
  }

  return Math.max(0, Math.min(volumeMillion, tier.toMillion) - tier.fromMillion);
}

export function calculateCustomIntroducerCommission(
  volumeEuro: number,
  settings: CustomTierSettings = DEFAULT_CUSTOM_TIER_SETTINGS
): CustomCommissionResult {
  const normalizedVolumeEuro = normalizeEuroAmount(volumeEuro);
  const volumeMillion = toMillion(normalizedVolumeEuro);
  const tiers = buildCustomTiers(settings);

  const tierBreakdown: [CustomTierBreakdown, CustomTierBreakdown, CustomTierBreakdown] =
    tiers.map(tier => {
      const volumeMillionInTier = volumeInTier(volumeMillion, tier);
      return {
        tier,
        volumeMillionInTier,
        commission: volumeMillionInTier * tier.ratePerMillion
      };
    }) as [CustomTierBreakdown, CustomTierBreakdown, CustomTierBreakdown];

  const totalCommission = tierBreakdown.reduce((sum, row) => sum + row.commission, 0);

  return {
    type: "custom",
    volumeEuro: normalizedVolumeEuro,
    volumeMillion,
    tiers: tierBreakdown,
    totalCommission
  };
}

export function calculateRevShareIntroducerCommission(
  input: RevShareInput
): RevShareResult {
  const totalRevenue = normalizeEuroAmount(input.totalRevenue);
  const totalCosts = normalizeEuroAmount(input.totalCosts);
  const sharePercent = normalizeSharePercent(input.sharePercent);
  const marginBeforeSplit = totalRevenue - totalCosts;
  const partnerShare = marginBeforeSplit * (sharePercent / 100);
  const ourMargin = marginBeforeSplit - partnerShare;

  return {
    type: "revShare",
    totalRevenue,
    totalCosts,
    sharePercent,
    marginBeforeSplit,
    partnerShare,
    ourMargin
  };
}
