import { safeFinite, safeNonNegative } from "./internals.js";
import type {
  OtherRevenueProfitabilityInput,
  OtherRevenueProfitabilityResult
} from "./types.js";

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
