import { describe, expect, it } from "vitest";
import {
  calculateOtherRevenueProfitability,
  calculatePayinProfitability,
  calculatePayinRegionProfitability,
  calculatePayoutProfitability,
  calculateTotalProfitability
} from "./profitability.js";

describe("zone5/profitability", () => {
  it("calculates payin region profitability for IC++ (no scheme/interchange cost)", () => {
    const result = calculatePayinRegionProfitability({
      volume: 7_500_000,
      mdrRevenue: 337_500,
      trxRevenue: 3_675,
      failedTrxRevenue: 0,
      attemptsCcTransactions: 9_188,
      attemptsApmTransactions: 3_937,
      pricingModel: "icpp",
      schemeFeesPercent: 0.3,
      interchangePercent: 0.5
    });

    expect(result.revenue.total).toBe(341_175);
    expect(result.costs.providerMdr).toBeCloseTo(127_500, 6);
    expect(result.costs.providerTrx).toBeCloseTo(3_084.35, 6);
    expect(result.costs.schemeFees).toBe(0);
    expect(result.costs.interchange).toBe(0);
    expect(result.costs.total).toBeCloseTo(130_584.35, 6);
    expect(result.netMargin).toBeCloseTo(210_590.65, 6);
  });

  it("adds scheme/interchange costs for blended payin model", () => {
    const result = calculatePayinRegionProfitability({
      volume: 7_500_000,
      mdrRevenue: 337_500,
      trxRevenue: 3_675,
      failedTrxRevenue: 0,
      attemptsCcTransactions: 9_188,
      attemptsApmTransactions: 3_937,
      pricingModel: "blended",
      schemeFeesPercent: 0.3,
      interchangePercent: 0.5
    });

    expect(result.costs.schemeFees).toBe(22_500);
    expect(result.costs.interchange).toBe(37_500);
    expect(result.costs.total).toBeCloseTo(190_584.35, 6);
    expect(result.netMargin).toBeCloseTo(150_590.65, 6);
  });

  it("aggregates payin EU+WW profitability", () => {
    const result = calculatePayinProfitability({
      eu: {
        volume: 7_500_000,
        mdrRevenue: 337_500,
        trxRevenue: 3_675,
        failedTrxRevenue: 900,
        attemptsCcTransactions: 9_188,
        attemptsApmTransactions: 3_937,
        pricingModel: "icpp",
        schemeFeesPercent: 0.3,
        interchangePercent: 0.5
      },
      ww: {
        volume: 7_500_000,
        mdrRevenue: 375_000,
        trxRevenue: 3_675,
        failedTrxRevenue: 900,
        attemptsCcTransactions: 9_188,
        attemptsApmTransactions: 3_937,
        pricingModel: "icpp",
        schemeFeesPercent: 0.8,
        interchangePercent: 1.8
      }
    });

    expect(result.revenue.mdr).toBe(712_500);
    expect(result.revenue.trx).toBe(7_350);
    expect(result.revenue.failedTrx).toBe(1_800);
    expect(result.revenue.total).toBe(721_650);
    expect(result.costs.providerMdr).toBeCloseTo(255_000, 6);
    expect(result.costs.providerTrx).toBeCloseTo(6_168.7, 6);
    expect(result.costs.total).toBeCloseTo(261_168.7, 6);
    expect(result.netMargin).toBeCloseTo(460_481.3, 6);
  });

  it("calculates payout profitability with provider tier costs", () => {
    const result = calculatePayoutProfitability({
      volume: 500_000,
      totalTransactions: 14_500,
      mdrRevenue: 10_000,
      trxRevenue: 36_250
    });

    expect(result.revenue.total).toBe(46_250);
    expect(result.costs.providerMdr).toBe(5_000);
    expect(result.costs.providerTrx).toBeCloseTo(5_800, 6);
    expect(result.costs.total).toBeCloseTo(10_800, 6);
    expect(result.netMargin).toBeCloseTo(35_450, 6);
  });

  it("calculates other revenue block", () => {
    const result = calculateOtherRevenueProfitability({
      threeDsRevenue: 1_050,
      threeDsCost: 630,
      settlementFeeRevenue: 46_320,
      monthlyMinimumAdjustment: 0
    });

    expect(result.revenue.total).toBe(47_370);
    expect(result.costs.total).toBe(630);
    expect(result.netMargin).toBe(46_740);
  });

  it("calculates total profitability for standard/custom mode", () => {
    const other = calculateOtherRevenueProfitability({
      threeDsRevenue: 1_050,
      threeDsCost: 630,
      settlementFeeRevenue: 46_320,
      monthlyMinimumAdjustment: 0
    });

    const result = calculateTotalProfitability({
      payin: {
        revenue: { mdr: 712_500, trx: 7_350, failedTrx: 0, total: 719_850 },
        costs: {
          providerMdr: 255_000,
          providerTrx: 6_168,
          schemeFees: 0,
          interchange: 0,
          total: 261_168
        },
        netMargin: 458_682
      },
      payout: {
        revenue: { mdr: 10_000, trx: 36_250, total: 46_250 },
        costs: { providerMdr: 5_000, providerTrx: 5_800, total: 10_800 },
        netMargin: 35_450
      },
      other,
      introducerCommissionType: "standard",
      introducerCommissionAmount: 90_000,
      revSharePercent: 25
    });

    expect(result.mode).toBe("standardCustom");
    expect(result.marginBeforeIntroducer).toBeCloseTo(540_872, 6);
    expect(result.introducerCommission).toBe(90_000);
    expect(result.ourMargin).toBeCloseTo(450_872, 6);
  });

  it("calculates total profitability for rev share mode", () => {
    const other = calculateOtherRevenueProfitability({
      threeDsRevenue: 1_050,
      threeDsCost: 630,
      settlementFeeRevenue: 46_320,
      monthlyMinimumAdjustment: 0
    });

    const result = calculateTotalProfitability({
      payin: {
        revenue: { mdr: 712_500, trx: 7_350, failedTrx: 0, total: 719_850 },
        costs: {
          providerMdr: 255_000,
          providerTrx: 6_168,
          schemeFees: 0,
          interchange: 0,
          total: 261_168
        },
        netMargin: 458_682
      },
      payout: {
        revenue: { mdr: 10_000, trx: 36_250, total: 46_250 },
        costs: { providerMdr: 5_000, providerTrx: 5_800, total: 10_800 },
        netMargin: 35_450
      },
      other,
      introducerCommissionType: "revShare",
      introducerCommissionAmount: 0,
      revSharePercent: 25
    });

    expect(result.mode).toBe("revShare");
    expect(result.totalRevenue).toBeCloseTo(813_470, 6);
    expect(result.totalCosts).toBeCloseTo(272_598, 6);
    expect(result.marginBeforeIntroducer).toBeCloseTo(540_872, 6);
    expect(result.introducerCommission).toBeCloseTo(114_670.5, 6);
    expect(result.ourMargin).toBeCloseTo(426_201.5, 6);
  });

  it("returns warning when resulting margin is negative", () => {
    const other = calculateOtherRevenueProfitability({
      threeDsRevenue: 0,
      threeDsCost: 0,
      settlementFeeRevenue: 0,
      monthlyMinimumAdjustment: 0
    });

    const result = calculateTotalProfitability({
      payin: {
        revenue: { mdr: 10_000, trx: 0, failedTrx: 0, total: 10_000 },
        costs: {
          providerMdr: 12_000,
          providerTrx: 0,
          schemeFees: 0,
          interchange: 0,
          total: 12_000
        },
        netMargin: -2_000
      },
      payout: {
        revenue: { mdr: 0, trx: 0, total: 0 },
        costs: { providerMdr: 0, providerTrx: 0, total: 0 },
        netMargin: 0
      },
      other,
      introducerCommissionType: "standard",
      introducerCommissionAmount: 0,
      revSharePercent: 25
    });

    expect(result.ourMargin).toBe(-2_000);
    expect(result.warning).toContain("Negative Margin");
  });
});
