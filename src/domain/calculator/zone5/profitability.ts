// Zone 5 profitability — barrel export.
//
// Internal modules:
//   - types.ts        — public type definitions
//   - constants.ts    — provider tier defaults
//   - internals.ts    — shared math helpers (safe parsing, tier splitting, MDR rows)
//   - payin.ts        — calculatePayinRegionProfitability + calculatePayinProfitability
//   - payout.ts       — calculatePayoutProfitability
//   - other.ts        — calculateOtherRevenueProfitability
//   - total.ts        — calculateTotalProfitability
//
// Public API of this module is unchanged. Calculator math is frozen — do not
// modify formulas in the underlying files without explicit product approval.

export type {
  ProviderTierConfig,
  TierPercentCostRow,
  TierTrxCostRow,
  PayinRegionProfitabilityInput,
  PayinRegionProfitability,
  PayinProfitabilityInput,
  PayinProfitabilityResult,
  PayoutProfitabilityInput,
  PayoutProfitabilityResult,
  OtherRevenueProfitabilityInput,
  OtherRevenueProfitabilityResult,
  TotalProfitabilityInput,
  TotalProfitabilityResult
} from "./types.js";

export {
  DEFAULT_PROVIDER_PAYIN_MDR_TIERS,
  DEFAULT_PROVIDER_PAYOUT_MDR_TIERS,
  DEFAULT_PROVIDER_PAYOUT_TRX_TIERS,
  DEFAULT_PROVIDER_PAYIN_TRX_CC_COST,
  DEFAULT_PROVIDER_PAYIN_TRX_APM_COST
} from "./constants.js";

export {
  calculatePayinRegionProfitability,
  calculatePayinProfitability
} from "./payin.js";
export { calculatePayoutProfitability } from "./payout.js";
export { calculateOtherRevenueProfitability } from "./other.js";
export { calculateTotalProfitability } from "./total.js";
