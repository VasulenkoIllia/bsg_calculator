import { useMemo } from "react";
import {
  DEFAULT_3DS_FEE_CONFIG,
  calculateFailedTrxImpact,
  calculateMonthlyMinimumFeeImpact,
  calculatePayoutMinimumFeeImpact,
  calculateSettlementFeeImpact,
  calculateThreeDsImpact,
  type CalculatorTypeSelection,
  type FailedTrxChargingMode,
  type FailedTrxImpact,
  type MonthlyMinimumFeeImpact,
  type PayoutMinimumFeeImpact,
  type PayoutPricingPreview,
  type PayinTrafficDerived,
  type PayoutTrafficDerived,
  type SettlementFeeImpact,
  type ThreeDsImpact,
} from "../../../domain/calculator/index.js";

export interface UseFeeImpactsParams {
  calculatorType: CalculatorTypeSelection;
  payin: PayinTrafficDerived;
  payout: PayoutTrafficDerived;
  payinBaseRevenue: number;
  payoutBaseRevenue: number;
  payinEffectiveTrxFeesByRegion: {
    eu: { ccFee: number; apmFee: number };
    ww: { ccFee: number; apmFee: number };
  };
  effectiveFailedTrxFees: { ccFee: number; apmFee: number };
  payoutPreview: PayoutPricingPreview;
  payoutMinimumFeeEnabled: boolean;
  payoutMinimumFeePerTransaction: number;
  threeDsEnabled: boolean;
  threeDsRevenuePerSuccessfulTransaction: number;
  settlementIncluded: boolean;
  settlementFeeEnabled: boolean;
  settlementFeeRatePercent: number;
  monthlyMinimumFeeEnabled: boolean;
  monthlyMinimumFeeAmount: number;
  failedTrxEnabled: boolean;
  failedTrxMode: FailedTrxChargingMode;
  failedTrxOverLimitThresholdPercent: number;
}

export interface UseFeeImpactsResult {
  payoutMinimumFeeImpact: PayoutMinimumFeeImpact;
  payoutRevenueAdjusted: number;
  threeDsImpact: ThreeDsImpact;
  threeDsPayinRegionalBreakdown: {
    eu: { successfulTransactions: number; attempts: number; revenue: number; cost: number; net: number };
    ww: { successfulTransactions: number; attempts: number; revenue: number; cost: number; net: number };
    total: { revenue: number; cost: number; net: number };
  };
  settlementFeeImpact: SettlementFeeImpact;
  monthlyMinimumFeeImpact: MonthlyMinimumFeeImpact;
  failedTrxImpact: FailedTrxImpact;
  failedTrxRevenueByRegion: { eu: number; ww: number };
  payoutTrxRevenueAdjusted: number;
}

export function useFeeImpacts(params: UseFeeImpactsParams): UseFeeImpactsResult {
  const {
    calculatorType,
    payin,
    payout,
    payinBaseRevenue,
    payoutBaseRevenue,
    payinEffectiveTrxFeesByRegion,
    effectiveFailedTrxFees,
    payoutPreview,
    payoutMinimumFeeEnabled,
    payoutMinimumFeePerTransaction,
    threeDsEnabled,
    threeDsRevenuePerSuccessfulTransaction,
    settlementIncluded,
    settlementFeeEnabled,
    settlementFeeRatePercent,
    monthlyMinimumFeeEnabled,
    monthlyMinimumFeeAmount,
    failedTrxEnabled,
    failedTrxMode,
    failedTrxOverLimitThresholdPercent,
  } = params;

  const payoutMinimumFeeImpact = useMemo(
    () =>
      calculatePayoutMinimumFeeImpact({
        config: {
          enabled: payoutMinimumFeeEnabled,
          minimumFeePerTransaction: payoutMinimumFeePerTransaction
        },
        payoutTransactions: calculatorType.payout
          ? payout.normalized.totalTransactions
          : 0,
        payoutRevenue: payoutBaseRevenue
      }),
    [
      calculatorType.payout,
      payout.normalized.totalTransactions,
      payoutBaseRevenue,
      payoutMinimumFeeEnabled,
      payoutMinimumFeePerTransaction
    ]
  );

  const payoutRevenueAdjusted = useMemo(
    () => (calculatorType.payout ? payoutMinimumFeeImpact.adjustedRevenue : 0),
    [calculatorType.payout, payoutMinimumFeeImpact.adjustedRevenue]
  );

  const threeDsImpact = useMemo(
    () =>
      calculateThreeDsImpact({
        config: {
          enabled: threeDsEnabled,
          revenuePerSuccessfulTransaction: threeDsRevenuePerSuccessfulTransaction,
          providerCostPerAttempt: DEFAULT_3DS_FEE_CONFIG.providerCostPerAttempt
        },
        successfulTransactions: calculatorType.payin ? payin.successful.total : 0,
        totalAttempts: calculatorType.payin ? payin.attempts.total : 0
      }),
    [
      calculatorType.payin,
      payin.attempts.total,
      payin.successful.total,
      threeDsEnabled,
      threeDsRevenuePerSuccessfulTransaction
    ]
  );

  const threeDsPayinRegionalBreakdown = useMemo(() => {
    const revenuePerSuccessful = Math.max(0, threeDsRevenuePerSuccessfulTransaction);
    const providerCostPerAttempt = DEFAULT_3DS_FEE_CONFIG.providerCostPerAttempt;
    const payinEnabled = calculatorType.payin;
    const buildRegion = (successfulTransactions: number, attempts: number) => {
      const revenue =
        payinEnabled && threeDsEnabled
          ? successfulTransactions * revenuePerSuccessful
          : 0;
      const cost = payinEnabled ? attempts * providerCostPerAttempt : 0;

      return {
        successfulTransactions,
        attempts,
        revenue,
        cost,
        net: revenue - cost
      };
    };

    const eu = buildRegion(payin.successful.eu, payin.attempts.eu);
    const ww = buildRegion(payin.successful.ww, payin.attempts.ww);

    return {
      eu,
      ww,
      total: {
        revenue: eu.revenue + ww.revenue,
        cost: eu.cost + ww.cost,
        net: eu.net + ww.net
      }
    };
  }, [
    calculatorType.payin,
    payin.attempts.eu,
    payin.attempts.ww,
    payin.successful.eu,
    payin.successful.ww,
    threeDsEnabled,
    threeDsRevenuePerSuccessfulTransaction
  ]);

  const settlementFeeImpact = useMemo(
    () =>
      calculateSettlementFeeImpact({
        config: {
          enabled: settlementFeeEnabled,
          ratePercent: settlementFeeRatePercent
        },
        settlementIncludedInPricing: settlementIncluded,
        payinVolume: calculatorType.payin ? payin.normalized.monthlyVolume : 0,
        payoutVolume: calculatorType.payout ? payout.normalized.monthlyVolume : 0,
        payinFeesAll: payinBaseRevenue + threeDsImpact.revenue,
        payoutFeesAll: payoutRevenueAdjusted
      }),
    [
      calculatorType.payin,
      calculatorType.payout,
      payin.normalized.monthlyVolume,
      payout.normalized.monthlyVolume,
      payinBaseRevenue,
      payoutRevenueAdjusted,
      settlementFeeEnabled,
      settlementFeeRatePercent,
      settlementIncluded,
      threeDsImpact.revenue
    ]
  );

  const monthlyMinimumFeeImpact = useMemo(
    () =>
      calculateMonthlyMinimumFeeImpact({
        config: {
          enabled: monthlyMinimumFeeEnabled,
          minimumMonthlyRevenue: monthlyMinimumFeeAmount
        },
        actualRevenue: payinBaseRevenue + payoutBaseRevenue
      }),
    [
      monthlyMinimumFeeAmount,
      monthlyMinimumFeeEnabled,
      payinBaseRevenue,
      payoutBaseRevenue
    ]
  );

  const failedTrxImpact = useMemo(
    () =>
      calculateFailedTrxImpact({
        config: {
          enabled: failedTrxEnabled,
          mode: failedTrxMode,
          overLimitThresholdPercent: failedTrxOverLimitThresholdPercent
        },
        successfulTransactions: payin.successful.total,
        totalAttempts: payin.attempts.total,
        failedCcTransactions: payin.failed.cc,
        failedApmTransactions: payin.failed.apm,
        trxCcFee: effectiveFailedTrxFees.ccFee,
        trxApmFee: effectiveFailedTrxFees.apmFee
      }),
    [
      effectiveFailedTrxFees.apmFee,
      effectiveFailedTrxFees.ccFee,
      failedTrxEnabled,
      failedTrxMode,
      failedTrxOverLimitThresholdPercent,
      payin.attempts.total,
      payin.failed.apm,
      payin.failed.cc,
      payin.successful.total
    ]
  );

  const failedTrxRevenueByRegion = useMemo(() => {
    if (!calculatorType.payin || !failedTrxEnabled || failedTrxMode !== "allFailedVolume") {
      return { eu: 0, ww: 0 };
    }

    const eu =
      payin.failed.byRegionMethod.euCc * payinEffectiveTrxFeesByRegion.eu.ccFee +
      payin.failed.byRegionMethod.euApm * payinEffectiveTrxFeesByRegion.eu.apmFee;
    const ww =
      payin.failed.byRegionMethod.wwCc * payinEffectiveTrxFeesByRegion.ww.ccFee +
      payin.failed.byRegionMethod.wwApm * payinEffectiveTrxFeesByRegion.ww.apmFee;

    return { eu, ww };
  }, [
    calculatorType.payin,
    failedTrxEnabled,
    failedTrxMode,
    payin.failed.byRegionMethod.euApm,
    payin.failed.byRegionMethod.euCc,
    payin.failed.byRegionMethod.wwApm,
    payin.failed.byRegionMethod.wwCc,
    payinEffectiveTrxFeesByRegion.eu.apmFee,
    payinEffectiveTrxFeesByRegion.eu.ccFee,
    payinEffectiveTrxFeesByRegion.ww.apmFee,
    payinEffectiveTrxFeesByRegion.ww.ccFee
  ]);

  const payoutTrxRevenueAdjusted = useMemo(
    () =>
      Math.max(
        0,
        payoutRevenueAdjusted - (calculatorType.payout ? payoutPreview.mdrRevenue : 0)
      ),
    [calculatorType.payout, payoutPreview.mdrRevenue, payoutRevenueAdjusted]
  );

  return {
    payoutMinimumFeeImpact,
    payoutRevenueAdjusted,
    threeDsImpact,
    threeDsPayinRegionalBreakdown,
    settlementFeeImpact,
    monthlyMinimumFeeImpact,
    failedTrxImpact,
    failedTrxRevenueByRegion,
    payoutTrxRevenueAdjusted,
  };
}
