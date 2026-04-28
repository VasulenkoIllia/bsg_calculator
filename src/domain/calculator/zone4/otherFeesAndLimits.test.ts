import { describe, expect, it } from "vitest";
import {
  calculateFailedTrxImpact,
  calculateMonthlyMinimumFeeImpact,
  calculatePayoutMinimumFeeImpact,
  calculateSettlementFeeImpact,
  calculateThreeDsImpact,
  DEFAULT_3DS_FEE_CONFIG,
  DEFAULT_CONTRACT_SUMMARY_SETTINGS,
  DEFAULT_FAILED_TRX_CHARGING_CONFIG,
  DEFAULT_MONTHLY_MINIMUM_FEE_CONFIG,
  DEFAULT_PAYOUT_MINIMUM_FEE_CONFIG,
  DEFAULT_SETTLEMENT_FEE_CONFIG,
  normalizePayoutMinimumFeePerTransaction
} from "./otherFeesAndLimits.js";

describe("zone4/otherFeesAndLimits", () => {
  it("rounds payout minimum fee up to one decimal", () => {
    expect(normalizePayoutMinimumFeePerTransaction(2.34)).toBe(2.4);
    expect(normalizePayoutMinimumFeePerTransaction(2.4)).toBe(2.4);
  });

  it("applies payout minimum fee when per-transaction revenue is below minimum", () => {
    const result = calculatePayoutMinimumFeeImpact({
      config: { ...DEFAULT_PAYOUT_MINIMUM_FEE_CONFIG, enabled: true, minimumFeePerTransaction: 2.5 },
      payoutTransactions: 14_500,
      payoutRevenue: 17_255
    });

    expect(result.perTransactionRevenue).toBeCloseTo(1.19, 2);
    expect(result.appliedPerTransactionRevenue).toBe(2.5);
    expect(result.adjustedRevenue).toBe(36_250);
    expect(result.upliftRevenue).toBe(18_995);
    expect(result.warning).toBe("⚠️ Payout Minimum Fee Applied");
  });

  it("exposes payout minimum fee contract-summary defaults", () => {
    expect(DEFAULT_CONTRACT_SUMMARY_SETTINGS.payoutMinimumFeeMode).toBe("overall");
    expect(DEFAULT_CONTRACT_SUMMARY_SETTINGS.payoutMinimumFeeThresholdMillion).toBe(2.5);
    expect(DEFAULT_CONTRACT_SUMMARY_SETTINGS.payoutMinimumFeePerTransaction).toBe(1);
    expect(DEFAULT_CONTRACT_SUMMARY_SETTINGS.payoutMinimumFeeEuThresholdMillion).toBe(2.5);
    expect(DEFAULT_CONTRACT_SUMMARY_SETTINGS.payoutMinimumFeeEuPerTransaction).toBe(1);
    expect(DEFAULT_CONTRACT_SUMMARY_SETTINGS.payoutMinimumFeeWwThresholdMillion).toBe(2.5);
    expect(DEFAULT_CONTRACT_SUMMARY_SETTINGS.payoutMinimumFeeWwPerTransaction).toBe(1);
  });

  it("calculates 3DS revenue by successful and cost by total attempts", () => {
    const result = calculateThreeDsImpact({
      config: { ...DEFAULT_3DS_FEE_CONFIG, enabled: true },
      successfulTransactions: 10_000,
      totalAttempts: 12_500
    });

    expect(result.revenue).toBe(500);
    expect(result.cost).toBe(375);
    expect(result.net).toBe(125);
  });

  it("applies settlement fee only when settlement is not included and toggle is enabled", () => {
    const off = calculateSettlementFeeImpact({
      config: { ...DEFAULT_SETTLEMENT_FEE_CONFIG, enabled: true, ratePercent: 0.3 },
      settlementIncludedInPricing: true,
      payinVolume: 1_000_000,
      payoutVolume: 500_000,
      payinFeesAll: 50_000,
      payoutFeesAll: 10_000
    });
    expect(off.visible).toBe(false);
    expect(off.fee).toBe(0);

    const on = calculateSettlementFeeImpact({
      config: { ...DEFAULT_SETTLEMENT_FEE_CONFIG, enabled: true, ratePercent: 0.3 },
      settlementIncludedInPricing: false,
      payinVolume: 1_000_000,
      payoutVolume: 500_000,
      payinFeesAll: 50_000,
      payoutFeesAll: 10_000
    });
    expect(on.baseNet).toBe(1_440_000);
    expect(on.fee).toBe(4_320);
    expect(on.clientNet).toBe(1_435_680);
  });

  it("applies monthly minimum fee when actual revenue is below floor", () => {
    const result = calculateMonthlyMinimumFeeImpact({
      config: { ...DEFAULT_MONTHLY_MINIMUM_FEE_CONFIG, enabled: true, minimumMonthlyRevenue: 5_000 },
      actualRevenue: 3_000
    });

    expect(result.appliedRevenue).toBe(5_000);
    expect(result.upliftRevenue).toBe(2_000);
    expect(result.warning).toBe("⚠️ Monthly Minimum Fee Applied");
  });

  it("applies failed trx revenue only in all-failed mode", () => {
    const allFailed = calculateFailedTrxImpact({
      config: { ...DEFAULT_FAILED_TRX_CHARGING_CONFIG, enabled: true, mode: "allFailedVolume" },
      successfulTransactions: 10_000,
      totalAttempts: 12_500,
      failedCcTransactions: 1_750,
      failedApmTransactions: 750,
      trxCcFee: 0.35,
      trxApmFee: 0.35
    });
    expect(allFailed.allFailedRevenue).toBe(875);
    expect(allFailed.effectiveRevenue).toBe(875);

    const overLimitOnly = calculateFailedTrxImpact({
      config: { ...DEFAULT_FAILED_TRX_CHARGING_CONFIG, enabled: true, mode: "overLimitOnly", overLimitThresholdPercent: 70 },
      successfulTransactions: 10_000,
      totalAttempts: 12_500,
      failedCcTransactions: 1_750,
      failedApmTransactions: 750,
      trxCcFee: 0.35,
      trxApmFee: 0.35
    });
    expect(overLimitOnly.thresholdAttempts).toBeCloseTo(14_285.714, 3);
    expect(overLimitOnly.overLimitAttempts).toBeCloseTo(1_785.714, 3);
    expect(overLimitOnly.effectiveRevenue).toBe(0);
  });
});
