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

  it("adds blended scheme costs and excludes interchange cost", () => {
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
    expect(result.costs.interchange).toBe(0);
    expect(result.costs.total).toBeCloseTo(153_084.35, 6);
    expect(result.netMargin).toBeCloseTo(188_090.65, 6);
  });

  it("aggregates payin EU+WW profitability using global provider MDR tiers", () => {
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
    expect(result.costs.providerMdr).toBeCloseTo(245_000, 6);
    expect(result.costs.providerTrx).toBeCloseTo(6_168.7, 6);
    expect(result.costs.total).toBeCloseTo(251_168.7, 6);
    expect(result.netMargin).toBeCloseTo(470_481.3, 6);
    expect(result.eu.costs.providerMdr).toBeCloseTo(122_500, 6);
    expect(result.ww.costs.providerMdr).toBeCloseTo(122_500, 6);
  });

  it("matches 25.1M payin (80/20) provider MDR allocation and no interchange cost", () => {
    const result = calculatePayinProfitability({
      eu: {
        volume: 20_080_000,
        mdrRevenue: 0,
        trxRevenue: 0,
        failedTrxRevenue: 0,
        attemptsCcTransactions: 0,
        attemptsApmTransactions: 0,
        pricingModel: "blended",
        schemeFeesPercent: 0.75,
        interchangePercent: 0.75
      },
      ww: {
        volume: 5_020_000,
        mdrRevenue: 0,
        trxRevenue: 0,
        failedTrxRevenue: 0,
        attemptsCcTransactions: 0,
        attemptsApmTransactions: 0,
        pricingModel: "blended",
        schemeFeesPercent: 2,
        interchangePercent: 2
      }
    });

    expect(result.costs.providerMdr).toBeCloseTo(396_400, 6);
    expect(result.eu.costs.providerMdr).toBeCloseTo(317_120, 6);
    expect(result.ww.costs.providerMdr).toBeCloseTo(79_280, 6);

    expect(result.eu.providerMdrRows[0].volume).toBeCloseTo(8_000_000, 6);
    expect(result.eu.providerMdrRows[1].volume).toBeCloseTo(12_000_000, 6);
    expect(result.eu.providerMdrRows[2].volume).toBeCloseTo(80_000, 6);
    expect(result.eu.providerMdrRows[0].cost).toBeCloseTo(136_000, 6);
    expect(result.eu.providerMdrRows[1].cost).toBeCloseTo(180_000, 6);
    expect(result.eu.providerMdrRows[2].cost).toBeCloseTo(1_120, 6);

    expect(result.ww.providerMdrRows[0].volume).toBeCloseTo(2_000_000, 6);
    expect(result.ww.providerMdrRows[1].volume).toBeCloseTo(3_000_000, 6);
    expect(result.ww.providerMdrRows[2].volume).toBeCloseTo(20_000, 6);
    expect(result.ww.providerMdrRows[0].cost).toBeCloseTo(34_000, 6);
    expect(result.ww.providerMdrRows[1].cost).toBeCloseTo(45_000, 6);
    expect(result.ww.providerMdrRows[2].cost).toBeCloseTo(280, 6);

    expect(result.eu.costs.schemeFees).toBeCloseTo(150_600, 6);
    expect(result.ww.costs.schemeFees).toBeCloseTo(100_400, 6);
    expect(result.eu.costs.interchange).toBe(0);
    expect(result.ww.costs.interchange).toBe(0);
    expect(result.costs.interchange).toBe(0);
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
      settlementFeeRevenue: -46_320,
      monthlyMinimumAdjustment: 0
    });

    expect(result.revenue.total).toBe(-45_270);
    expect(result.costs.total).toBe(630);
    expect(result.netMargin).toBe(-45_900);
  });

  it("calculates total profitability for standard/custom mode", () => {
    const other = calculateOtherRevenueProfitability({
      threeDsRevenue: 1_050,
      threeDsCost: 630,
      settlementFeeRevenue: -46_320,
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
      introducerEnabled: true,
      introducerCommissionType: "standard",
      introducerCommissionAmount: 90_000,
      revSharePercent: 25
    });

    expect(result.mode).toBe("standardCustom");
    expect(result.marginBeforeIntroducer).toBeCloseTo(448_232, 6);
    expect(result.introducerCommission).toBe(90_000);
    expect(result.ourMargin).toBeCloseTo(358_232, 6);
  });

  it("calculates total profitability for rev share mode", () => {
    const other = calculateOtherRevenueProfitability({
      threeDsRevenue: 1_050,
      threeDsCost: 630,
      settlementFeeRevenue: -46_320,
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
      introducerEnabled: true,
      introducerCommissionType: "revShare",
      introducerCommissionAmount: 0,
      revSharePercent: 25
    });

    expect(result.mode).toBe("revShare");
    expect(result.totalRevenue).toBeCloseTo(766_100, 6);
    expect(result.totalCosts).toBeCloseTo(272_598, 6);
    expect(result.marginBeforeIntroducer).toBeCloseTo(448_232, 6);
    expect(result.introducerCommission).toBeCloseTo(114_670.5, 6);
    expect(result.ourMargin).toBeCloseTo(333_561.5, 6);
  });

  it("skips introducer commission when agent is disabled", () => {
    const other = calculateOtherRevenueProfitability({
      threeDsRevenue: 1_050,
      threeDsCost: 630,
      settlementFeeRevenue: -46_320,
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
      introducerEnabled: false,
      introducerCommissionType: "revShare",
      introducerCommissionAmount: 90_000,
      revSharePercent: 25
    });

    expect(result.mode).toBe("disabled");
    expect(result.marginBeforeIntroducer).toBeCloseTo(448_232, 6);
    expect(result.introducerCommission).toBe(0);
    expect(result.revSharePercentApplied).toBe(0);
    expect(result.ourMargin).toBeCloseTo(448_232, 6);
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
      introducerEnabled: true,
      introducerCommissionType: "standard",
      introducerCommissionAmount: 0,
      revSharePercent: 25
    });

    expect(result.ourMargin).toBe(-2_000);
    expect(result.warning).toContain("Negative Margin");
  });
});
