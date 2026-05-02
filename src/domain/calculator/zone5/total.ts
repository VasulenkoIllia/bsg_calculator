import { safeFinite, safeNonNegative } from "./internals.js";
import type { TotalProfitabilityInput, TotalProfitabilityResult } from "./types.js";

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
