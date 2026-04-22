import { describe, expect, it } from "vitest";
import {
  calculatePayinRegionPricingPreview,
  calculatePayoutPricingPreview,
  collectPayinPricingWarnings,
  collectPayoutPricingWarnings,
  DEFAULT_PAYIN_EU_PRICING_CONFIG,
  DEFAULT_PAYOUT_PRICING_CONFIG
} from "./pricingConfiguration.js";
import type { PayinTierRevenueBreakdown, PayoutTierRevenueBreakdown } from "./pricingConfiguration.js";

describe("zone3/pricingConfiguration", () => {
  it("calculates payin single-rate preview", () => {
    const result = calculatePayinRegionPricingPreview({
      volume: 1_000_000,
      averageTransaction: 200,
      successful: { cc: 1_000, apm: 500 },
      methodVolume: { cc: 700_000, apm: 300_000 },
      config: {
        ...DEFAULT_PAYIN_EU_PRICING_CONFIG,
        rateMode: "single",
        single: { mdrPercent: 4.5, trxCc: 0.35, trxApm: 0.35 }
      }
    });

    expect(result.mdrRevenue).toBe(45_000);
    expect(result.trxRevenue).toBe(525);
    expect(result.totalRevenue).toBe(45_525);
    expect(result.schemeCostImpact).toBe(0);
    expect(result.revenueAfterSchemePreview).toBe(45_525);
    expect(result.tierRows).toHaveLength(0);
  });

  it("calculates payin tiered preview progressively", () => {
    const result = calculatePayinRegionPricingPreview({
      volume: 15_000_000,
      averageTransaction: 500,
      successful: { cc: 14_700, apm: 6_300 },
      methodVolume: { cc: 10_500_000, apm: 4_500_000 },
      config: {
        ...DEFAULT_PAYIN_EU_PRICING_CONFIG,
        rateMode: "tiered"
      }
    });

    expect(result.tierRows).toHaveLength(3);
    const payinTierRows = result.tierRows as [
      PayinTierRevenueBreakdown,
      PayinTierRevenueBreakdown,
      PayinTierRevenueBreakdown
    ];
    expect(payinTierRows[0].mdrRevenue).toBe(450_000);
    expect(payinTierRows[1].mdrRevenue).toBeCloseTo(212_500, 6);
    expect(payinTierRows[2].mdrRevenue).toBe(0);
    expect(result.mdrRevenue).toBeCloseTo(662_500, 6);
    expect(result.trxRevenue).toBeCloseTo(10_150, 4);
    expect(result.totalRevenue).toBeCloseTo(672_650, 4);
    expect(result.schemeCostImpact).toBe(0);
    expect(result.revenueAfterSchemePreview).toBeCloseTo(672_650, 4);
  });

  it("applies scheme-cost impact only for blended model", () => {
    const icpp = calculatePayinRegionPricingPreview({
      volume: 7_500_000,
      averageTransaction: 500,
      successful: { cc: 7_350, apm: 3_150 },
      methodVolume: { cc: 5_250_000, apm: 2_250_000 },
      config: {
        ...DEFAULT_PAYIN_EU_PRICING_CONFIG,
        model: "icpp",
        rateMode: "single",
        schemeFeesPercent: 0.3
      }
    });
    expect(icpp.schemeCostImpact).toBe(0);

    const blended = calculatePayinRegionPricingPreview({
      volume: 7_500_000,
      averageTransaction: 500,
      successful: { cc: 7_350, apm: 3_150 },
      methodVolume: { cc: 5_250_000, apm: 2_250_000 },
      config: {
        ...DEFAULT_PAYIN_EU_PRICING_CONFIG,
        model: "blended",
        rateMode: "single",
        schemeFeesPercent: 0.3
      }
    });
    expect(blended.schemeCostImpact).toBe(22_500);
    expect(blended.revenueAfterSchemePreview).toBeCloseTo(
      blended.totalRevenue - blended.schemeCostImpact,
      6
    );
  });

  it("calculates payout single-rate preview", () => {
    const result = calculatePayoutPricingPreview({
      volume: 500_000,
      averageTransaction: 100,
      totalTransactions: 5_000,
      config: {
        ...DEFAULT_PAYOUT_PRICING_CONFIG,
        rateMode: "single",
        single: { mdrPercent: 2.0, trxFee: 0.5 }
      }
    });

    expect(result.mdrRevenue).toBe(10_000);
    expect(result.trxRevenue).toBe(2_500);
    expect(result.totalRevenue).toBe(12_500);
    expect(result.tierRows).toHaveLength(0);
    expect(result.singleRateMinimumAdjustment).not.toBeNull();
    expect(result.singleRateMinimumAdjustment?.mdrMinimumApplied).toBe(false);
    expect(result.singleRateMinimumAdjustment?.trxMinimumApplied).toBe(false);
  });

  it("calculates payout tiered preview progressively", () => {
    const result = calculatePayoutPricingPreview({
      volume: 12_000_000,
      averageTransaction: 100,
      totalTransactions: 120_000,
      config: {
        ...DEFAULT_PAYOUT_PRICING_CONFIG,
        rateMode: "tiered"
      }
    });

    expect(result.tierRows).toHaveLength(3);
    const payoutTierRows = result.tierRows as [
      PayoutTierRevenueBreakdown,
      PayoutTierRevenueBreakdown,
      PayoutTierRevenueBreakdown
    ];
    expect(payoutTierRows[0].mdrRevenue).toBe(200_000);
    expect(payoutTierRows[1].mdrRevenue).toBeCloseTo(36_000, 6);
    expect(payoutTierRows[0].trxRevenue).toBe(50_000);
    expect(payoutTierRows[1].trxRevenue).toBe(9_000);
    expect(result.mdrRevenue).toBe(236_000);
    expect(result.trxRevenue).toBe(59_000);
    expect(result.totalRevenue).toBe(295_000);
    expect(result.minimumAdjustments.every(adjustment => !adjustment.mdrMinimumApplied)).toBe(true);
    expect(result.minimumAdjustments.every(adjustment => !adjustment.trxMinimumApplied)).toBe(true);
  });

  it("applies payout minimum floors to calculations in single mode", () => {
    const result = calculatePayoutPricingPreview({
      volume: 500_000,
      averageTransaction: 100,
      totalTransactions: 5_000,
      config: {
        ...DEFAULT_PAYOUT_PRICING_CONFIG,
        rateMode: "single",
        single: { mdrPercent: 1.0, trxFee: 0.15 }
      }
    });

    expect(result.mdrRevenue).toBeCloseTo(6_500, 6);
    expect(result.trxRevenue).toBe(1_000);
    expect(result.totalRevenue).toBeCloseTo(7_500, 6);
    expect(result.singleRateMinimumAdjustment).not.toBeNull();
    expect(result.singleRateMinimumAdjustment?.configuredMdrPercent).toBe(1.0);
    expect(result.singleRateMinimumAdjustment?.appliedMdrPercent).toBe(1.3);
    expect(result.singleRateMinimumAdjustment?.configuredTrxFee).toBe(0.15);
    expect(result.singleRateMinimumAdjustment?.appliedTrxFee).toBe(0.2);
    expect(result.singleRateMinimumAdjustment?.mdrMinimumApplied).toBe(true);
    expect(result.singleRateMinimumAdjustment?.trxMinimumApplied).toBe(true);
  });

  it("applies payout minimum floors per tier in tiered mode", () => {
    const result = calculatePayoutPricingPreview({
      volume: 12_000_000,
      averageTransaction: 100,
      totalTransactions: 120_000,
      config: {
        ...DEFAULT_PAYOUT_PRICING_CONFIG,
        rateMode: "tiered",
        tiers: [
          { mdrPercent: 1.0, trxFee: 0.1 },
          { mdrPercent: 1.2, trxFee: 0.19 },
          { mdrPercent: 1.5, trxFee: 0.4 }
        ]
      }
    });

    expect(result.mdrRevenue).toBeCloseTo(156_000, 6);
    expect(result.trxRevenue).toBe(24_000);
    expect(result.totalRevenue).toBeCloseTo(180_000, 6);
    expect(result.singleRateMinimumAdjustment).toBeNull();
    expect(result.minimumAdjustments[0].mdrMinimumApplied).toBe(true);
    expect(result.minimumAdjustments[0].trxMinimumApplied).toBe(true);
    expect(result.minimumAdjustments[1].mdrMinimumApplied).toBe(true);
    expect(result.minimumAdjustments[1].trxMinimumApplied).toBe(true);
    expect(result.minimumAdjustments[2].mdrMinimumApplied).toBe(false);
    expect(result.minimumAdjustments[2].trxMinimumApplied).toBe(false);
    const tierRows = result.tierRows as [
      PayoutTierRevenueBreakdown,
      PayoutTierRevenueBreakdown,
      PayoutTierRevenueBreakdown
    ];
    expect(tierRows[0].configuredMdrPercent).toBe(1.0);
    expect(tierRows[0].appliedMdrPercent).toBe(1.3);
    expect(tierRows[0].configuredTrxFee).toBe(0.1);
    expect(tierRows[0].appliedTrxFee).toBe(0.2);
  });

  it("returns expected warnings for low rates", () => {
    const payinWarnings = collectPayinPricingWarnings({
      ...DEFAULT_PAYIN_EU_PRICING_CONFIG,
      rateMode: "single",
      single: { ...DEFAULT_PAYIN_EU_PRICING_CONFIG.single, mdrPercent: 2.4 }
    });
    expect(payinWarnings).toContain("⚠️ Low rate - please verify agreement");

    const payoutWarnings = collectPayoutPricingWarnings({
      ...DEFAULT_PAYOUT_PRICING_CONFIG,
      rateMode: "single",
      single: { mdrPercent: 1.2, trxFee: 0.35 }
    });
    expect(payoutWarnings).toContain("⚠️ Payout MDR below 1.3% minimum");
    expect(payoutWarnings).toContain("⚠️ Low payout TRX fee (< €0.40)");
  });
});
