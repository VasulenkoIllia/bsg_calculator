import type { ProviderTierConfig } from "./types.js";

export const EURO_PER_MILLION = 1_000_000;

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
