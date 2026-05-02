import { useEffect, useMemo, type Dispatch, type SetStateAction } from "react";
import {
  DEFAULT_3DS_FEE_CONFIG,
  DEFAULT_PROVIDER_PAYIN_TRX_APM_COST,
  DEFAULT_PROVIDER_PAYIN_TRX_CC_COST,
  calculateOtherRevenueProfitability,
  calculateFailedTrxImpact,
  calculateMonthlyMinimumFeeImpact,
  calculatePayoutMinimumFeeImpact,
  calculatePayinProfitability,
  calculatePayinRegionPricingPreview,
  calculatePayoutProfitability,
  calculatePayoutPricingPreview,
  calculateSettlementFeeImpact,
  calculateThreeDsImpact,
  calculateTotalProfitability,
  calculateCustomIntroducerCommission,
  calculateRevShareIntroducerCommission,
  calculateStandardIntroducerCommission,
  derivePayinTraffic,
  derivePayoutTraffic,
  type CalculatorTypeSelection,
  type FailedTrxChargingMode,
  type IntroducerCommissionType,
  type PayinRegionPricingConfig,
  type PayoutPricingConfig,
  formatAmount2,
  formatAmountInteger,
  formatVariableAmount
} from "../../domain/calculator/index.js";
import {
  collectExpandableNodeIds,
  resolveEffectiveMethodTrxFee,
  resolveMethodTrxRevenue
} from "./appHelpers.js";
import { formatCount } from "./formatUtils.js";
import { formatInputNumber } from "./numberUtils.js";
import type { UnifiedProfitabilityNode } from "./types.js";

type UseCalculatorDerivedDataParams = {
  calculatorType: CalculatorTypeSelection;
  payinVolume: number;
  payinTransactions: number;
  approvalRatioPercent: number;
  euPercent: number;
  ccPercent: number;
  payoutVolume: number;
  payoutTransactions: number;
  introducerEnabled: boolean;
  introducerCommissionType: IntroducerCommissionType;
  customTier1UpToMillion: number;
  customTier2UpToMillion: number;
  customTier1RatePerMillion: number;
  customTier2RatePerMillion: number;
  customTier3RatePerMillion: number;
  revSharePercent: number;
  settlementIncluded: boolean;
  payinEuPricing: PayinRegionPricingConfig;
  payinWwPricing: PayinRegionPricingConfig;
  payoutPricing: PayoutPricingConfig;
  payoutMinimumFeeEnabled: boolean;
  payoutMinimumFeePerTransaction: number;
  threeDsEnabled: boolean;
  threeDsRevenuePerSuccessfulTransaction: number;
  settlementFeeEnabled: boolean;
  settlementFeeRatePercent: number;
  monthlyMinimumFeeEnabled: boolean;
  monthlyMinimumFeeAmount: number;
  failedTrxEnabled: boolean;
  failedTrxMode: FailedTrxChargingMode;
  failedTrxOverLimitThresholdPercent: number;
  setUnifiedExpandedById: Dispatch<SetStateAction<Record<string, boolean>>>;
};

export function useCalculatorDerivedData({
  calculatorType,
  payinVolume,
  payinTransactions,
  approvalRatioPercent,
  euPercent,
  ccPercent,
  payoutVolume,
  payoutTransactions,
  introducerEnabled,
  introducerCommissionType,
  customTier1UpToMillion,
  customTier2UpToMillion,
  customTier1RatePerMillion,
  customTier2RatePerMillion,
  customTier3RatePerMillion,
  revSharePercent,
  settlementIncluded,
  payinEuPricing,
  payinWwPricing,
  payoutPricing,
  payoutMinimumFeeEnabled,
  payoutMinimumFeePerTransaction,
  threeDsEnabled,
  threeDsRevenuePerSuccessfulTransaction,
  settlementFeeEnabled,
  settlementFeeRatePercent,
  monthlyMinimumFeeEnabled,
  monthlyMinimumFeeAmount,
  failedTrxEnabled,
  failedTrxMode,
  failedTrxOverLimitThresholdPercent,
  setUnifiedExpandedById
}: UseCalculatorDerivedDataParams) {
  const payin = useMemo(
    () =>
      derivePayinTraffic({
        monthlyVolume: payinVolume,
        successfulTransactions: payinTransactions,
        approvalRatioPercent,
        euPercent,
        ccPercent
      }),
    [approvalRatioPercent, ccPercent, euPercent, payinTransactions, payinVolume]
  );

  const payout = useMemo(
    () =>
      derivePayoutTraffic({
        monthlyVolume: payoutVolume,
        totalTransactions: payoutTransactions
      }),
    [payoutTransactions, payoutVolume]
  );

  const introducerBaseVolume = useMemo(
    () => (calculatorType.payin ? payin.normalized.monthlyVolume : 0),
    [calculatorType.payin, payin.normalized.monthlyVolume]
  );

  const standardIntroducer = useMemo(
    () => calculateStandardIntroducerCommission(introducerBaseVolume),
    [introducerBaseVolume]
  );

  const customIntroducer = useMemo(
    () =>
      calculateCustomIntroducerCommission(introducerBaseVolume, {
        tier1UpToMillion: customTier1UpToMillion,
        tier2UpToMillion: customTier2UpToMillion,
        tier1RatePerMillion: Math.max(0, customTier1RatePerMillion),
        tier2RatePerMillion: Math.max(0, customTier2RatePerMillion),
        tier3RatePerMillion: Math.max(0, customTier3RatePerMillion)
      }),
    [
      customTier1RatePerMillion,
      customTier1UpToMillion,
      customTier2RatePerMillion,
      customTier2UpToMillion,
      customTier3RatePerMillion,
      introducerBaseVolume
    ]
  );

  const payinEuPreview = useMemo(
    () =>
      calculatePayinRegionPricingPreview({
        volume: payin.volume.eu,
        averageTransaction: payin.averageTransaction,
        successful: {
          cc: payin.successful.byRegionMethod.euCc,
          apm: payin.successful.byRegionMethod.euApm
        },
        methodVolume: {
          cc: payin.volume.byRegionMethod.euCc,
          apm: payin.volume.byRegionMethod.euApm
        },
        config: payinEuPricing
      }),
    [payin.averageTransaction, payin.successful.byRegionMethod.euApm, payin.successful.byRegionMethod.euCc, payin.volume.byRegionMethod.euApm, payin.volume.byRegionMethod.euCc, payin.volume.eu, payinEuPricing]
  );
  const payinWwPreview = useMemo(
    () =>
      calculatePayinRegionPricingPreview({
        volume: payin.volume.ww,
        averageTransaction: payin.averageTransaction,
        successful: {
          cc: payin.successful.byRegionMethod.wwCc,
          apm: payin.successful.byRegionMethod.wwApm
        },
        methodVolume: {
          cc: payin.volume.byRegionMethod.wwCc,
          apm: payin.volume.byRegionMethod.wwApm
        },
        config: payinWwPricing
      }),
    [payin.averageTransaction, payin.successful.byRegionMethod.wwApm, payin.successful.byRegionMethod.wwCc, payin.volume.byRegionMethod.wwApm, payin.volume.byRegionMethod.wwCc, payin.volume.ww, payinWwPricing]
  );
  const payoutPreview = useMemo(
    () =>
      calculatePayoutPricingPreview({
        volume: payout.normalized.monthlyVolume,
        averageTransaction: payout.averageTransaction,
        totalTransactions: payout.normalized.totalTransactions,
        config: payoutPricing
      }),
    [payout.averageTransaction, payout.normalized.monthlyVolume, payout.normalized.totalTransactions, payoutPricing]
  );
  const payoutRateMinimumAdjustments = useMemo(
    () =>
      payoutPreview.minimumAdjustments.filter(
        adjustment => adjustment.mdrMinimumApplied || adjustment.trxMinimumApplied
      ),
    [payoutPreview.minimumAdjustments]
  );
  const payoutSingleRateMinimumAdjustment = payoutPreview.singleRateMinimumAdjustment;
  const payinBaseRevenue = useMemo(
    () =>
      calculatorType.payin
        ? payinEuPreview.totalRevenue + payinWwPreview.totalRevenue
        : 0,
    [calculatorType.payin, payinEuPreview.totalRevenue, payinWwPreview.totalRevenue]
  );
  const payoutBaseRevenue = useMemo(
    () => (calculatorType.payout ? payoutPreview.totalRevenue : 0),
    [calculatorType.payout, payoutPreview.totalRevenue]
  );
  const payinEffectiveTrxFeesByRegion = useMemo(() => {
    const euCcFee = resolveEffectiveMethodTrxFee(payinEuPricing, payinEuPreview, "cc");
    const euApmFee = resolveEffectiveMethodTrxFee(
      payinEuPricing,
      payinEuPreview,
      "apm"
    );
    const wwCcFee = resolveEffectiveMethodTrxFee(payinWwPricing, payinWwPreview, "cc");
    const wwApmFee = resolveEffectiveMethodTrxFee(
      payinWwPricing,
      payinWwPreview,
      "apm"
    );
    return {
      eu: { ccFee: euCcFee, apmFee: euApmFee },
      ww: { ccFee: wwCcFee, apmFee: wwApmFee }
    };
  }, [
    payinEuPreview,
    payinEuPricing,
    payinWwPreview,
    payinWwPricing
  ]);
  const effectiveFailedTrxFees = useMemo(() => {
    const euFailedCc = payin.failed.byRegionMethod.euCc;
    const wwFailedCc = payin.failed.byRegionMethod.wwCc;
    const euFailedApm = payin.failed.byRegionMethod.euApm;
    const wwFailedApm = payin.failed.byRegionMethod.wwApm;
    const totalFailedCc = euFailedCc + wwFailedCc;
    const totalFailedApm = euFailedApm + wwFailedApm;

    return {
      ccFee:
        totalFailedCc > 0
          ? (payinEffectiveTrxFeesByRegion.eu.ccFee * euFailedCc +
              payinEffectiveTrxFeesByRegion.ww.ccFee * wwFailedCc) /
            totalFailedCc
          : 0,
      apmFee:
        totalFailedApm > 0
          ? (payinEffectiveTrxFeesByRegion.eu.apmFee * euFailedApm +
              payinEffectiveTrxFeesByRegion.ww.apmFee * wwFailedApm) /
            totalFailedApm
          : 0
    };
  }, [
    payin.failed.byRegionMethod.euApm,
    payin.failed.byRegionMethod.euCc,
    payin.failed.byRegionMethod.wwApm,
    payin.failed.byRegionMethod.wwCc,
    payinEffectiveTrxFeesByRegion.eu.apmFee,
    payinEffectiveTrxFeesByRegion.eu.ccFee,
    payinEffectiveTrxFeesByRegion.ww.apmFee,
    payinEffectiveTrxFeesByRegion.ww.ccFee
  ]);
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
  const payinProfitability = useMemo(
    () =>
      calculatePayinProfitability({
        eu: {
          volume: calculatorType.payin ? payin.volume.eu : 0,
          mdrRevenue: calculatorType.payin ? payinEuPreview.mdrRevenue : 0,
          trxRevenue: calculatorType.payin ? payinEuPreview.trxRevenue : 0,
          failedTrxRevenue: failedTrxRevenueByRegion.eu,
          attemptsCcTransactions: calculatorType.payin ? payin.attempts.byRegionMethod.euCc : 0,
          attemptsApmTransactions: calculatorType.payin ? payin.attempts.byRegionMethod.euApm : 0,
          pricingModel: payinEuPricing.model,
          schemeFeesPercent: payinEuPricing.schemeFeesPercent,
          interchangePercent: payinEuPricing.interchangePercent,
          providerTrxCcCost: DEFAULT_PROVIDER_PAYIN_TRX_CC_COST,
          providerTrxApmCost: DEFAULT_PROVIDER_PAYIN_TRX_APM_COST
        },
        ww: {
          volume: calculatorType.payin ? payin.volume.ww : 0,
          mdrRevenue: calculatorType.payin ? payinWwPreview.mdrRevenue : 0,
          trxRevenue: calculatorType.payin ? payinWwPreview.trxRevenue : 0,
          failedTrxRevenue: failedTrxRevenueByRegion.ww,
          attemptsCcTransactions: calculatorType.payin ? payin.attempts.byRegionMethod.wwCc : 0,
          attemptsApmTransactions: calculatorType.payin ? payin.attempts.byRegionMethod.wwApm : 0,
          pricingModel: payinWwPricing.model,
          schemeFeesPercent: payinWwPricing.schemeFeesPercent,
          interchangePercent: payinWwPricing.interchangePercent,
          providerTrxCcCost: DEFAULT_PROVIDER_PAYIN_TRX_CC_COST,
          providerTrxApmCost: DEFAULT_PROVIDER_PAYIN_TRX_APM_COST
        }
      }),
    [
      calculatorType.payin,
      failedTrxRevenueByRegion.eu,
      failedTrxRevenueByRegion.ww,
      payin.attempts.byRegionMethod.euApm,
      payin.attempts.byRegionMethod.euCc,
      payin.attempts.byRegionMethod.wwApm,
      payin.attempts.byRegionMethod.wwCc,
      payin.volume.eu,
      payin.volume.ww,
      payinEuPreview.mdrRevenue,
      payinEuPreview.trxRevenue,
      payinEuPricing.interchangePercent,
      payinEuPricing.model,
      payinEuPricing.schemeFeesPercent,
      payinWwPreview.mdrRevenue,
      payinWwPreview.trxRevenue,
      payinWwPricing.interchangePercent,
      payinWwPricing.model,
      payinWwPricing.schemeFeesPercent
    ]
  );
  const payoutProfitability = useMemo(
    () =>
      calculatePayoutProfitability({
        volume: calculatorType.payout ? payout.normalized.monthlyVolume : 0,
        totalTransactions: calculatorType.payout ? payout.normalized.totalTransactions : 0,
        mdrRevenue: calculatorType.payout ? payoutPreview.mdrRevenue : 0,
        trxRevenue: payoutTrxRevenueAdjusted
      }),
    [
      calculatorType.payout,
      payout.normalized.monthlyVolume,
      payout.normalized.totalTransactions,
      payoutPreview.mdrRevenue,
      payoutTrxRevenueAdjusted
    ]
  );
  const payinProfitabilityWithThreeDs = useMemo(() => {
    const euRevenueTotal =
      payinProfitability.eu.revenue.total + threeDsPayinRegionalBreakdown.eu.revenue;
    const wwRevenueTotal =
      payinProfitability.ww.revenue.total + threeDsPayinRegionalBreakdown.ww.revenue;
    const euCostsTotal =
      payinProfitability.eu.costs.total + threeDsPayinRegionalBreakdown.eu.cost;
    const wwCostsTotal =
      payinProfitability.ww.costs.total + threeDsPayinRegionalBreakdown.ww.cost;

    const revenueTotal = euRevenueTotal + wwRevenueTotal;
    const costsTotal = euCostsTotal + wwCostsTotal;

    return {
      ...payinProfitability,
      eu: {
        ...payinProfitability.eu,
        revenue: {
          ...payinProfitability.eu.revenue,
          total: euRevenueTotal
        },
        costs: {
          ...payinProfitability.eu.costs,
          total: euCostsTotal
        },
        netMargin: euRevenueTotal - euCostsTotal
      },
      ww: {
        ...payinProfitability.ww,
        revenue: {
          ...payinProfitability.ww.revenue,
          total: wwRevenueTotal
        },
        costs: {
          ...payinProfitability.ww.costs,
          total: wwCostsTotal
        },
        netMargin: wwRevenueTotal - wwCostsTotal
      },
      revenue: {
        ...payinProfitability.revenue,
        total: revenueTotal
      },
      costs: {
        ...payinProfitability.costs,
        total: costsTotal
      },
      netMargin: revenueTotal - costsTotal
    };
  }, [
    payinProfitability,
    threeDsPayinRegionalBreakdown.eu.cost,
    threeDsPayinRegionalBreakdown.eu.revenue,
    threeDsPayinRegionalBreakdown.ww.cost,
    threeDsPayinRegionalBreakdown.ww.revenue
  ]);
  const otherRevenueProfitability = useMemo(
    () =>
      calculateOtherRevenueProfitability({
        threeDsRevenue: 0,
        threeDsCost: 0,
        settlementFeeRevenue: settlementFeeImpact.fee,
        monthlyMinimumAdjustment: monthlyMinimumFeeImpact.upliftRevenue
      }),
    [monthlyMinimumFeeImpact.upliftRevenue, settlementFeeImpact.fee]
  );
  const revShareIntroducer = useMemo(
    () =>
      calculateRevShareIntroducerCommission({
        totalRevenue: payinProfitabilityWithThreeDs.revenue.total,
        totalCosts: payinProfitabilityWithThreeDs.costs.total,
        sharePercent: revSharePercent
      }),
    [
      payinProfitabilityWithThreeDs.costs.total,
      payinProfitabilityWithThreeDs.revenue.total,
      revSharePercent
    ]
  );
  const selectedIntroducerCommissionAmount = useMemo(() => {
    if (introducerCommissionType === "standard") {
      return standardIntroducer.totalCommission;
    }
    if (introducerCommissionType === "custom") {
      return customIntroducer.totalCommission;
    }
    return revShareIntroducer.partnerShare;
  }, [
    customIntroducer.totalCommission,
    introducerCommissionType,
    revShareIntroducer.partnerShare,
    standardIntroducer.totalCommission
  ]);
  const introducerCommissionAmount = introducerEnabled ? selectedIntroducerCommissionAmount : 0;
  const totalProfitability = useMemo(
    () =>
      calculateTotalProfitability({
        payin: payinProfitabilityWithThreeDs,
        payout: payoutProfitability,
        other: otherRevenueProfitability,
        introducerEnabled,
        introducerCommissionType,
        introducerCommissionAmount: selectedIntroducerCommissionAmount,
        revSharePercent
      }),
    [
      introducerCommissionAmount,
      introducerEnabled,
      introducerCommissionType,
      otherRevenueProfitability,
      payinProfitabilityWithThreeDs,
      payoutProfitability,
      selectedIntroducerCommissionAmount,
      revSharePercent
    ]
  );
  const euTrxRevenueCc = useMemo(
    () =>
      resolveMethodTrxRevenue(
        payinEuPricing,
        payinEuPreview,
        payin.successful.byRegionMethod.euCc,
        "cc"
      ),
    [payin.successful.byRegionMethod.euCc, payinEuPreview, payinEuPricing]
  );
  const euTrxRevenueApm = useMemo(
    () =>
      resolveMethodTrxRevenue(
        payinEuPricing,
        payinEuPreview,
        payin.successful.byRegionMethod.euApm,
        "apm"
      ),
    [payin.successful.byRegionMethod.euApm, payinEuPreview, payinEuPricing]
  );
  const wwTrxRevenueCc = useMemo(
    () =>
      resolveMethodTrxRevenue(
        payinWwPricing,
        payinWwPreview,
        payin.successful.byRegionMethod.wwCc,
        "cc"
      ),
    [payin.successful.byRegionMethod.wwCc, payinWwPreview, payinWwPricing]
  );
  const wwTrxRevenueApm = useMemo(
    () =>
      resolveMethodTrxRevenue(
        payinWwPricing,
        payinWwPreview,
        payin.successful.byRegionMethod.wwApm,
        "apm"
      ),
    [payin.successful.byRegionMethod.wwApm, payinWwPreview, payinWwPricing]
  );
  const unifiedProfitabilityTree = useMemo<UnifiedProfitabilityNode[]>(() => {
    const nodes: UnifiedProfitabilityNode[] = [];
    const otherRevenueFormula =
      otherRevenueProfitability.revenue.monthlyMinimumAdjustment > 0
        ? `Other Revenue = Settlement Fee (${formatAmount2(
            otherRevenueProfitability.revenue.settlementFee
          )}) + Monthly Minimum Adj (${formatAmount2(
            otherRevenueProfitability.revenue.monthlyMinimumAdjustment
          )})`
        : `Other Revenue = Settlement Fee (${formatAmount2(
            otherRevenueProfitability.revenue.settlementFee
          )})`;

    const totalChildren: UnifiedProfitabilityNode[] =
      introducerEnabled && introducerCommissionType === "revShare"
        ? [
            {
              id: "unified-total-revenue",
              label: "Total Revenue",
              value: totalProfitability.totalRevenue,
              formula: `Total Revenue = Payin Revenue (${formatAmount2(
                payinProfitabilityWithThreeDs.revenue.total
              )}) + Payout Revenue (${formatAmount2(
                payoutProfitability.revenue.total
              )}) + Other Revenue (${formatAmount2(otherRevenueProfitability.revenue.total)})`
            },
            {
              id: "unified-total-costs",
              label: "Total Costs",
              value: -totalProfitability.totalCosts,
              formula: `Total Costs = Payin Costs (${formatAmount2(
                payinProfitabilityWithThreeDs.costs.total
              )}) + Payout Costs (${formatAmount2(
                payoutProfitability.costs.total
              )}) + Other Costs (${formatAmount2(otherRevenueProfitability.costs.total)})`
            },
            {
              id: "unified-margin-before-split",
              label: "Margin Before Split",
              value: totalProfitability.marginBeforeIntroducer,
              formula: `Margin Before Split = Total Revenue (${formatAmount2(
                totalProfitability.totalRevenue
              )}) - Total Costs (${formatAmount2(totalProfitability.totalCosts)})`
            },
            {
              id: "unified-introducer-revshare",
              label: `Introducer Commission (${formatInputNumber(
                totalProfitability.revSharePercentApplied
              )}%)`,
              value: -totalProfitability.introducerCommission,
              formula: `Introducer Commission = Payin Net Margin (${formatAmount2(
                totalProfitability.payinNetMargin
              )}) × ${formatInputNumber(totalProfitability.revSharePercentApplied)}%`
            },
            {
              id: "unified-our-margin",
              label: "Our Margin",
              value: totalProfitability.ourMargin,
              formula: `Our Margin = Margin Before Split (${formatAmount2(
                totalProfitability.marginBeforeIntroducer
              )}) - Introducer Commission (${formatAmount2(
                totalProfitability.introducerCommission
              )})`
            }
          ]
        : [
            {
              id: "unified-payin-net",
              label: "Payin Net Margin",
              value: totalProfitability.payinNetMargin,
              formula: `Payin Net Margin = Total Payin Revenue (${formatAmount2(
                payinProfitabilityWithThreeDs.revenue.total
              )}) - Total Payin Costs (${formatAmount2(payinProfitabilityWithThreeDs.costs.total)})`
            },
            {
              id: "unified-payout-net",
              label: "Payout Net Margin",
              value: totalProfitability.payoutNetMargin,
              formula: `Payout Net Margin = Total Payout Revenue (${formatAmount2(
                payoutProfitability.revenue.total
              )}) - Total Payout Costs (${formatAmount2(payoutProfitability.costs.total)})`
            },
            {
              id: "unified-total-other-net-margin",
              label: "Other Revenue",
              value: totalProfitability.otherNetMargin,
              formula: otherRevenueFormula
            },
            {
              id: "unified-total-margin",
              label: "Total Margin",
              value: totalProfitability.marginBeforeIntroducer,
              formula: `Total Margin = Payin Net (${formatAmount2(
                totalProfitability.payinNetMargin
              )}) + Payout Net (${formatAmount2(
                totalProfitability.payoutNetMargin
              )}) + Other Revenue (${formatAmount2(totalProfitability.otherNetMargin)})`
            },
            {
              id: "unified-introducer",
              label: "Introducer Commission",
              value: -totalProfitability.introducerCommission,
              formula: introducerEnabled
                ? `Introducer Commission = Zone 2 Commission (${formatAmount2(
                    totalProfitability.introducerCommission
                  )})`
                : "Introducer Commission = 0 because Agent / Introducer is not enabled"
            },
          {
            id: "unified-our-margin",
            label: "Our Margin",
            value: totalProfitability.ourMargin,
            formula: `Our Margin = Total Margin (${formatAmount2(
              totalProfitability.marginBeforeIntroducer
            )}) - Introducer Commission (${formatAmount2(
              totalProfitability.introducerCommission
            )})`
          }
        ];

    const buildPayinCostChildren = (
      regionKey: "eu" | "ww",
      regionLabel: "EU" | "WW",
      pricing: PayinRegionPricingConfig,
      volume: number
    ): UnifiedProfitabilityNode[] => {
      const regionProfitability =
        regionKey === "eu" ? payinProfitability.eu : payinProfitability.ww;
      const isBlended = pricing.model === "blended";

      const children: UnifiedProfitabilityNode[] = [
        ...regionProfitability.providerMdrRows.map((row, index) => ({
          id: `unified-payin-${regionKey}-provider-mdr-tier-${index}`,
          label: `Provider MDR ${row.label} (${regionLabel})`,
          value: -row.cost,
          formula: `${formatAmountInteger(row.volume)} × ${formatInputNumber(
            row.ratePercent
          )}% = ${formatAmount2(row.cost)}`
        })),
        {
          id: `unified-payin-${regionKey}-provider-trx-cc`,
          label: `Provider TRX CC (${regionLabel})`,
          value: -regionProfitability.providerTrxBreakdown.ccCost,
          formula: `${formatCount(
            regionProfitability.providerTrxBreakdown.attemptsCc
          )} attempts × ${formatVariableAmount(DEFAULT_PROVIDER_PAYIN_TRX_CC_COST)} = ${formatAmount2(
            regionProfitability.providerTrxBreakdown.ccCost
          )}`
        },
        {
          id: `unified-payin-${regionKey}-provider-trx-apm`,
          label: `Provider TRX APM (${regionLabel})`,
          value: -regionProfitability.providerTrxBreakdown.apmCost,
          formula: `${formatCount(
            regionProfitability.providerTrxBreakdown.attemptsApm
          )} attempts × ${formatVariableAmount(DEFAULT_PROVIDER_PAYIN_TRX_APM_COST)} = ${formatAmount2(
            regionProfitability.providerTrxBreakdown.apmCost
          )}`
        }
      ];

      if (!isBlended) return children;

      children.push({
        id: `unified-payin-${regionKey}-scheme-fees`,
        label: `Scheme Fees (${regionLabel}, Blended)`,
        value: -regionProfitability.costs.schemeFees,
        formula: `${formatAmountInteger(volume)} × ${formatInputNumber(
          pricing.schemeFeesPercent
        )}% = ${formatAmount2(regionProfitability.costs.schemeFees)}`
      });

      return children;
    };

    const buildPayinCostFormula = (
      regionLabel: "EU" | "WW",
      profitability: typeof payinProfitability.eu,
      pricing: PayinRegionPricingConfig
    ): string => {
      const parts = [
        `Provider MDR (${formatAmount2(profitability.costs.providerMdr)})`,
        `Provider TRX (${formatAmount2(profitability.costs.providerTrx)})`
      ];

      if (pricing.model === "blended") {
        parts.push(`Scheme Fees (${formatAmount2(profitability.costs.schemeFees)})`);
      }

      return `${regionLabel} Costs = ${parts.join(" + ")}`;
    };
    const buildTotalPayinCostFormula = (): string => {
      const parts = [
        `Provider MDR (${formatAmount2(payinProfitability.costs.providerMdr)})`,
        `Provider TRX (${formatAmount2(payinProfitability.costs.providerTrx)})`,
        `3DS Costs (EU ${formatAmount2(
          threeDsPayinRegionalBreakdown.eu.cost
        )} + WW ${formatAmount2(threeDsPayinRegionalBreakdown.ww.cost)})`
      ];

      if (payinEuPricing.model === "blended" || payinWwPricing.model === "blended") {
        parts.push(`Scheme Fees (${formatAmount2(payinProfitability.costs.schemeFees)})`);
      }

      return `Total Payin Costs = ${parts.join(" + ")} = ${formatAmount2(
        payinProfitabilityWithThreeDs.costs.total
      )}`;
    };

    nodes.push({
      id: "unified-total-profitability",
      label: "TOTAL PROFITABILITY",
      value: totalProfitability.ourMargin,
      formula: `Final Profitability Result = Our Margin (${formatAmount2(totalProfitability.ourMargin)})`,
      children: totalChildren
    });

    if (calculatorType.payin) {
      nodes.push({
        id: "unified-payin-root",
        label: "Payin Revenue & Costs",
        value: payinProfitabilityWithThreeDs.netMargin,
        formula: `Payin Net Margin = Total Payin Revenue (${formatAmount2(
          payinProfitabilityWithThreeDs.revenue.total
        )}) - Total Payin Costs (${formatAmount2(payinProfitabilityWithThreeDs.costs.total)})`,
        children: [
          {
            id: "unified-payin-total-revenue",
            label: "Total Payin Revenue",
            value: payinProfitabilityWithThreeDs.revenue.total,
            formula: `Total Payin Revenue = MDR (${formatAmount2(
              payinProfitability.revenue.mdr
            )}) + TRX (${formatAmount2(payinProfitability.revenue.trx)}) + Failed TRX (${formatAmount2(
              payinProfitability.revenue.failedTrx
            )}) + 3DS Revenue (EU ${formatAmount2(
              threeDsPayinRegionalBreakdown.eu.revenue
            )} + WW ${formatAmount2(threeDsPayinRegionalBreakdown.ww.revenue)}) = ${formatAmount2(
              payinProfitabilityWithThreeDs.revenue.total
            )}`,
            children: [
              {
                id: "unified-payin-eu-revenue",
                label: "EU Revenue",
                value: payinProfitability.eu.revenue.total,
                formula: `EU Revenue = EU MDR (${formatAmount2(
                  payinEuPreview.mdrRevenue
                )}) + EU TRX (${formatAmount2(payinEuPreview.trxRevenue)}) + EU Failed TRX (${formatAmount2(
                  failedTrxRevenueByRegion.eu
                )})`,
                children: [
                  {
                    id: "unified-payin-eu-mdr-revenue",
                    label: "MDR Revenue (EU)",
                    value: payinEuPreview.mdrRevenue,
                    formula: `${formatAmountInteger(payin.volume.eu)} × ${formatInputNumber(
                      payinEuPricing.rateMode === "single"
                        ? payinEuPricing.single.mdrPercent
                        : payinEuPreview.mdrRevenue > 0
                          ? (payinEuPreview.mdrRevenue / Math.max(payin.volume.eu, 1)) * 100
                          : 0
                    )}%`,
                    children:
                      payinEuPricing.rateMode === "tiered"
                        ? payinEuPreview.tierRows.map((row, index) => ({
                            id: `unified-payin-eu-mdr-revenue-tier-${index}`,
                            label: `MDR ${row.label} (EU)`,
                            value: row.mdrRevenue,
                            formula: `${formatAmountInteger(row.volume)} × ${formatInputNumber(
                              row.mdrPercent
                            )}% = ${formatAmount2(row.mdrRevenue)}`
                          }))
                        : undefined
                  },
                  {
                    id: "unified-payin-eu-trx-cc",
                    label: "TRX Revenue CC (EU)",
                    value: euTrxRevenueCc,
                    formula: `${formatCount(
                      payin.successful.byRegionMethod.euCc
                    )} trx × effective CC fee = ${formatAmount2(euTrxRevenueCc)}`,
                    children:
                      payinEuPricing.rateMode === "tiered" && payinEuPricing.trxFeeEnabled
                        ? payinEuPreview.tierRows.map((row, index) => ({
                            id: `unified-payin-eu-trx-cc-tier-${index}`,
                            label: `TRX CC ${row.label} (EU)`,
                            value: row.ccTransactions * row.trxCc,
                            formula: `${formatInputNumber(row.ccTransactions)} trx × ${formatVariableAmount(
                              row.trxCc
                            )} = ${formatAmount2(row.ccTransactions * row.trxCc)}`
                          }))
                        : undefined
                  },
                  {
                    id: "unified-payin-eu-trx-apm",
                    label: "TRX Revenue APM (EU)",
                    value: euTrxRevenueApm,
                    formula: `${formatCount(
                      payin.successful.byRegionMethod.euApm
                    )} trx × effective APM fee = ${formatAmount2(euTrxRevenueApm)}`,
                    children:
                      payinEuPricing.rateMode === "tiered" && payinEuPricing.trxFeeEnabled
                        ? payinEuPreview.tierRows.map((row, index) => ({
                            id: `unified-payin-eu-trx-apm-tier-${index}`,
                            label: `TRX APM ${row.label} (EU)`,
                            value: row.apmTransactions * row.trxApm,
                            formula: `${formatInputNumber(row.apmTransactions)} trx × ${formatVariableAmount(
                              row.trxApm
                            )} = ${formatAmount2(row.apmTransactions * row.trxApm)}`
                          }))
                        : undefined
                  },
                  {
                    id: "unified-payin-eu-failed-trx",
                    label: "Failed TRX Revenue (EU)",
                    value: failedTrxRevenueByRegion.eu,
                    formula: `Failed CC/APM in EU charged by effective TRX fees (${formatAmount2(
                      failedTrxRevenueByRegion.eu
                    )})`
                  }
                ]
              },
              {
                id: "unified-payin-ww-revenue",
                label: "WW Revenue",
                value: payinProfitability.ww.revenue.total,
                formula: `WW Revenue = WW MDR (${formatAmount2(
                  payinWwPreview.mdrRevenue
                )}) + WW TRX (${formatAmount2(payinWwPreview.trxRevenue)}) + WW Failed TRX (${formatAmount2(
                  failedTrxRevenueByRegion.ww
                )})`,
                children: [
                  {
                    id: "unified-payin-ww-mdr-revenue",
                    label: "MDR Revenue (WW)",
                    value: payinWwPreview.mdrRevenue,
                    formula: `${formatAmountInteger(payin.volume.ww)} × ${formatInputNumber(
                      payinWwPricing.rateMode === "single"
                        ? payinWwPricing.single.mdrPercent
                        : payinWwPreview.mdrRevenue > 0
                          ? (payinWwPreview.mdrRevenue / Math.max(payin.volume.ww, 1)) * 100
                          : 0
                    )}%`,
                    children:
                      payinWwPricing.rateMode === "tiered"
                        ? payinWwPreview.tierRows.map((row, index) => ({
                            id: `unified-payin-ww-mdr-revenue-tier-${index}`,
                            label: `MDR ${row.label} (WW)`,
                            value: row.mdrRevenue,
                            formula: `${formatAmountInteger(row.volume)} × ${formatInputNumber(
                              row.mdrPercent
                            )}% = ${formatAmount2(row.mdrRevenue)}`
                          }))
                        : undefined
                  },
                  {
                    id: "unified-payin-ww-trx-cc",
                    label: "TRX Revenue CC (WW)",
                    value: wwTrxRevenueCc,
                    formula: `${formatCount(
                      payin.successful.byRegionMethod.wwCc
                    )} trx × effective CC fee = ${formatAmount2(wwTrxRevenueCc)}`,
                    children:
                      payinWwPricing.rateMode === "tiered" && payinWwPricing.trxFeeEnabled
                        ? payinWwPreview.tierRows.map((row, index) => ({
                            id: `unified-payin-ww-trx-cc-tier-${index}`,
                            label: `TRX CC ${row.label} (WW)`,
                            value: row.ccTransactions * row.trxCc,
                            formula: `${formatInputNumber(row.ccTransactions)} trx × ${formatVariableAmount(
                              row.trxCc
                            )} = ${formatAmount2(row.ccTransactions * row.trxCc)}`
                          }))
                        : undefined
                  },
                  {
                    id: "unified-payin-ww-trx-apm",
                    label: "TRX Revenue APM (WW)",
                    value: wwTrxRevenueApm,
                    formula: `${formatCount(
                      payin.successful.byRegionMethod.wwApm
                    )} trx × effective APM fee = ${formatAmount2(wwTrxRevenueApm)}`,
                    children:
                      payinWwPricing.rateMode === "tiered" && payinWwPricing.trxFeeEnabled
                        ? payinWwPreview.tierRows.map((row, index) => ({
                            id: `unified-payin-ww-trx-apm-tier-${index}`,
                            label: `TRX APM ${row.label} (WW)`,
                            value: row.apmTransactions * row.trxApm,
                            formula: `${formatInputNumber(row.apmTransactions)} trx × ${formatVariableAmount(
                              row.trxApm
                            )} = ${formatAmount2(row.apmTransactions * row.trxApm)}`
                          }))
                        : undefined
                  },
                  {
                    id: "unified-payin-ww-failed-trx",
                    label: "Failed TRX Revenue (WW)",
                    value: failedTrxRevenueByRegion.ww,
                    formula: `Failed CC/APM in WW charged by effective TRX fees (${formatAmount2(
                      failedTrxRevenueByRegion.ww
                    )})`
                  }
                ]
              },
              {
                id: "unified-payin-eu-3ds-revenue",
                label: "3DS Revenue (EU)",
                value: threeDsPayinRegionalBreakdown.eu.revenue,
                formula: `3DS Revenue (EU) = Successful Payin EU Transactions (${formatCount(
                  threeDsPayinRegionalBreakdown.eu.successfulTransactions
                )}) × 3DS Revenue per Successful (${formatVariableAmount(
                  threeDsRevenuePerSuccessfulTransaction
                )})`
              },
              {
                id: "unified-payin-ww-3ds-revenue",
                label: "3DS Revenue (WW)",
                value: threeDsPayinRegionalBreakdown.ww.revenue,
                formula: `3DS Revenue (WW) = Successful Payin WW Transactions (${formatCount(
                  threeDsPayinRegionalBreakdown.ww.successfulTransactions
                )}) × 3DS Revenue per Successful (${formatVariableAmount(
                  threeDsRevenuePerSuccessfulTransaction
                )})`
              }
            ]
          },
          {
            id: "unified-payin-total-costs",
            label: "Total Payin Costs",
            value: -payinProfitabilityWithThreeDs.costs.total,
            formula: buildTotalPayinCostFormula(),
            children: [
              {
                id: "unified-payin-eu-costs",
                label: "EU Costs",
                value: -payinProfitability.eu.costs.total,
                formula: buildPayinCostFormula("EU", payinProfitability.eu, payinEuPricing),
                children: buildPayinCostChildren("eu", "EU", payinEuPricing, payin.volume.eu)
              },
              {
                id: "unified-payin-ww-costs",
                label: "WW Costs",
                value: -payinProfitability.ww.costs.total,
                formula: buildPayinCostFormula("WW", payinProfitability.ww, payinWwPricing),
                children: buildPayinCostChildren("ww", "WW", payinWwPricing, payin.volume.ww)
              },
              {
                id: "unified-payin-eu-3ds-cost",
                label: "3DS Costs (EU)",
                value: -threeDsPayinRegionalBreakdown.eu.cost,
                formula: `3DS Costs (EU) = EU Payin Attempts (${formatCount(
                  threeDsPayinRegionalBreakdown.eu.attempts
                )}) × Provider 3DS Cost per Attempt (${formatVariableAmount(
                  DEFAULT_3DS_FEE_CONFIG.providerCostPerAttempt
                )})`
              },
              {
                id: "unified-payin-ww-3ds-cost",
                label: "3DS Costs (WW)",
                value: -threeDsPayinRegionalBreakdown.ww.cost,
                formula: `3DS Costs (WW) = WW Payin Attempts (${formatCount(
                  threeDsPayinRegionalBreakdown.ww.attempts
                )}) × Provider 3DS Cost per Attempt (${formatVariableAmount(
                  DEFAULT_3DS_FEE_CONFIG.providerCostPerAttempt
                )})`
              }
            ]
          }
        ]
      });
    }

    if (calculatorType.payout) {
      const payoutRevenueChildren: UnifiedProfitabilityNode[] = [
        {
          id: "unified-payout-mdr-revenue",
          label: "MDR Revenue (Payout)",
          value: payoutProfitability.revenue.mdr,
          formula:
            payoutPricing.rateMode === "single"
              ? `MDR Revenue (Payout) = Monthly Payout Volume (${formatAmountInteger(
                  payout.normalized.monthlyVolume
                )}) × effective MDR (${formatInputNumber(
                  payout.normalized.monthlyVolume > 0
                    ? (payoutProfitability.revenue.mdr / payout.normalized.monthlyVolume) * 100
                    : 0
                )}%) = ${formatAmount2(payoutProfitability.revenue.mdr)}`
              : `MDR Revenue (Payout) = ${payoutPreview.tierRows
                  .map(row => `${row.label} (${formatAmount2(row.mdrRevenue)})`)
                  .join(" + ")} = ${formatAmount2(payoutProfitability.revenue.mdr)}`,
          children:
            payoutPricing.rateMode === "tiered"
              ? payoutPreview.tierRows.map((row, index) => ({
                  id: `unified-payout-mdr-revenue-tier-${index}`,
                  label: `MDR ${row.label} (Payout)`,
                  value: row.mdrRevenue,
                  formula: `${formatAmountInteger(row.volume)} × ${formatInputNumber(
                    row.appliedMdrPercent
                  )}% = ${formatAmount2(row.mdrRevenue)}`
                }))
              : undefined
        },
        {
          id: "unified-payout-trx-revenue",
          label: "TRX Revenue (Payout)",
          value: payoutProfitability.revenue.trx,
          formula:
            payoutPricing.rateMode === "single" || payoutMinimumFeeImpact.warning
              ? `TRX Revenue (Payout) = Payout Transactions (${formatCount(
                  payout.normalized.totalTransactions
                )}) × effective TRX (${formatVariableAmount(
                  payout.normalized.totalTransactions > 0
                    ? payoutProfitability.revenue.trx / payout.normalized.totalTransactions
                    : 0
                )}) = ${formatAmount2(payoutProfitability.revenue.trx)}`
              : `TRX Revenue (Payout) = ${payoutPreview.tierRows
                  .map(row => `${row.label} (${formatAmount2(row.trxRevenue)})`)
                  .join(" + ")} = ${formatAmount2(payoutProfitability.revenue.trx)}`,
          children:
            payoutPricing.rateMode === "tiered" && !payoutMinimumFeeImpact.warning
              ? payoutPreview.tierRows.map((row, index) => ({
                  id: `unified-payout-trx-revenue-tier-${index}`,
                  label: `TRX ${row.label} (Payout)`,
                  value: row.trxRevenue,
                  formula: `${formatCount(row.transactions)} trx × ${formatVariableAmount(
                    row.appliedTrxFee
                  )} = ${formatAmount2(row.trxRevenue)}`
                }))
              : undefined
        }
      ];

      const payoutCostChildren: UnifiedProfitabilityNode[] = [
        ...payoutProfitability.providerMdrRows.map((row, index) => ({
          id: `unified-payout-provider-mdr-tier-${index}`,
          label: `Provider MDR ${row.label} (Payout)`,
          value: -row.cost,
          formula: `${formatAmountInteger(row.volume)} × ${formatInputNumber(
            row.ratePercent
          )}% = ${formatAmount2(row.cost)}`
        })),
        ...payoutProfitability.providerTrxRows.map((row, index) => ({
          id: `unified-payout-provider-trx-tier-${index}`,
          label: `Provider TRX ${row.label} (Payout)`,
          value: -row.cost,
          formula: `${formatCount(row.transactions)} trx × ${formatVariableAmount(
            row.feePerTransaction
          )} = ${formatAmount2(row.cost)}`
        }))
      ];

      nodes.push({
        id: "unified-payout-root",
        label: "Payout Revenue & Costs",
        value: payoutProfitability.netMargin,
        formula: `Payout Net Margin = Total Payout Revenue (${formatAmount2(
          payoutProfitability.revenue.total
        )}) - Total Payout Costs (${formatAmount2(payoutProfitability.costs.total)})`,
        children: [
          {
            id: "unified-payout-total-revenue",
            label: payoutMinimumFeeImpact.warning
              ? "Total Payout Revenue (Minimum Applied)"
              : "Total Payout Revenue",
            value: payoutProfitability.revenue.total,
            formula: payoutMinimumFeeImpact.warning
              ? `Total Payout Revenue (minimum applied) = max(Base Payout Revenue (${formatAmount2(
                payoutMinimumFeeImpact.baseRevenue
                )}), Minimum Per-TRX (${formatVariableAmount(
                  payoutMinimumFeeImpact.appliedPerTransactionRevenue
                )}) × Transactions (${formatCount(
                  payout.normalized.totalTransactions
                )})) = ${formatAmount2(payoutProfitability.revenue.total)}`
              : `Total Payout Revenue = MDR (${formatAmount2(
                  payoutProfitability.revenue.mdr
                )}) + TRX (${formatAmount2(payoutProfitability.revenue.trx)})`,
            children: payoutRevenueChildren
          },
          {
            id: "unified-payout-total-costs",
            label: "Total Payout Costs",
            value: -payoutProfitability.costs.total,
            formula: `Total Payout Costs = Provider MDR (${formatAmount2(
              payoutProfitability.costs.providerMdr
            )}) + Provider TRX (${formatAmount2(payoutProfitability.costs.providerTrx)})`,
            children: payoutCostChildren
          }
        ]
      });
    }

    nodes.push({
      id: "unified-other-revenue-root",
      label: "Other Revenue",
      value: otherRevenueProfitability.netMargin,
      formula: otherRevenueFormula,
      children: [
        {
          id: "unified-other-settlement-fee",
          label: "Settlement Fee",
          value: otherRevenueProfitability.revenue.settlementFee,
          formula: !settlementFeeImpact.visible
            ? "Settlement Fee = €0 because Settlement Included is ON in Zone 3"
            : settlementFeeEnabled
            ? `Settlement Fee = Chargeable Net (${formatAmount2(
                settlementFeeImpact.chargeableNet
              )}) × Settlement Rate (${formatInputNumber(settlementFeeRatePercent)}%) = ${formatAmount2(
                settlementFeeImpact.fee
              )}`
            : `Settlement Fee = €0 because Settlement Fee toggle is OFF (reference if enabled: Chargeable Net ${formatAmount2(
                settlementFeeImpact.chargeableNet
              )} × Settlement Rate ${formatInputNumber(settlementFeeRatePercent)}% = ${formatAmount2(
                settlementFeeImpact.chargeableNet * (settlementFeeRatePercent / 100)
              )})`,
          children: [
            {
              id: "unified-other-settlement-chargeable-net",
              label: "Chargeable Net",
              value: settlementFeeImpact.chargeableNet,
              formula: `Chargeable Net = max(0, (Total Payin Volume (${formatAmountInteger(
                calculatorType.payin ? payin.normalized.monthlyVolume : 0
              )}) - Total Payout Volume (${formatAmountInteger(
                calculatorType.payout ? payout.normalized.monthlyVolume : 0
              )})) - (Total Payin Fee (${formatAmount2(
                payinBaseRevenue + threeDsImpact.revenue
              )}) + Total Payout Fee (${formatAmount2(
                payoutRevenueAdjusted
              )}))) = max(0, ${formatAmount2(settlementFeeImpact.baseNet)}) = ${formatAmount2(
                settlementFeeImpact.chargeableNet
              )}`
            }
          ]
        },
        {
          id: "unified-other-monthly-minimum",
          label: "Monthly Minimum Adjustment",
          value: otherRevenueProfitability.revenue.monthlyMinimumAdjustment,
          formula: monthlyMinimumFeeImpact.warning
            ? `Monthly Minimum Adj (minimum applied) = Applied Monthly Revenue (${formatAmount2(
                monthlyMinimumFeeImpact.appliedRevenue
              )}) - Actual Revenue (${formatAmount2(
                monthlyMinimumFeeImpact.baseRevenue
              )}) = ${formatAmount2(otherRevenueProfitability.revenue.monthlyMinimumAdjustment)}`
            : `Monthly Minimum Adj = max(0, Minimum (${formatAmount2(
                monthlyMinimumFeeAmount
              )}) - Actual Revenue (${formatAmount2(monthlyMinimumFeeImpact.baseRevenue)}))`
        }
      ]
    });

    nodes.push({
      id: "unified-introducer-root",
      label: "Introducer Commission",
      value: -introducerCommissionAmount,
      formula: !introducerEnabled
        ? "Introducer Commission = 0 because Agent / Introducer is not enabled"
        : introducerCommissionType === "revShare"
          ? `Rev Share (Payin only) = (Payin Revenue (${formatAmount2(
              revShareIntroducer.totalRevenue
            )}) - Payin Costs (${formatAmount2(revShareIntroducer.totalCosts)})) × ${formatInputNumber(
              revShareIntroducer.sharePercent
            )}%`
          : `Commission = ${formatAmount2(introducerCommissionAmount)} from Zone 2 (${
              introducerCommissionType === "standard" ? "Standard" : "Custom"
            })`
    });

    return nodes;
  }, [
    calculatorType.payin,
    calculatorType.payout,
    euTrxRevenueApm,
    euTrxRevenueCc,
    failedTrxRevenueByRegion.eu,
    failedTrxRevenueByRegion.ww,
    introducerEnabled,
    introducerCommissionAmount,
    introducerCommissionType,
    monthlyMinimumFeeAmount,
    monthlyMinimumFeeImpact.appliedRevenue,
    monthlyMinimumFeeImpact.baseRevenue,
    otherRevenueProfitability.netMargin,
    otherRevenueProfitability.revenue.monthlyMinimumAdjustment,
    otherRevenueProfitability.revenue.settlementFee,
    payinProfitabilityWithThreeDs,
    payin.successful.byRegionMethod.euApm,
    payin.successful.byRegionMethod.euCc,
    payin.successful.byRegionMethod.wwApm,
    payin.successful.byRegionMethod.wwCc,
    payin.normalized.monthlyVolume,
    payin.attempts.total,
    payin.successful.total,
    payin.volume.eu,
    payin.volume.ww,
    payinBaseRevenue,
    payinEuPreview.mdrRevenue,
    payinEuPreview.tierRows,
    payinEuPreview.trxRevenue,
    payinEuPricing.model,
    payinEuPricing.rateMode,
    payinEuPricing.schemeFeesPercent,
    payinEuPricing.single.mdrPercent,
    payinEuPricing.trxFeeEnabled,
    payinProfitability.costs.providerMdr,
    payinProfitability.costs.providerTrx,
    payinProfitability.costs.schemeFees,
    payinProfitability.costs.total,
    payinProfitability.eu.costs.providerMdr,
    payinProfitability.eu.costs.providerTrx,
    payinProfitability.eu.costs.schemeFees,
    payinProfitability.eu.costs.total,
    payinProfitability.eu.providerMdrRows,
    payinProfitability.eu.providerTrxBreakdown.apmCost,
    payinProfitability.eu.providerTrxBreakdown.attemptsApm,
    payinProfitability.eu.providerTrxBreakdown.attemptsCc,
    payinProfitability.eu.providerTrxBreakdown.ccCost,
    payinProfitability.eu.revenue.total,
    payinProfitability.netMargin,
    payinProfitability.revenue.failedTrx,
    payinProfitability.revenue.mdr,
    payinProfitability.revenue.total,
    payinProfitability.revenue.trx,
    payinProfitability.ww.costs.providerMdr,
    payinProfitability.ww.costs.providerTrx,
    payinProfitability.ww.costs.schemeFees,
    payinProfitability.ww.costs.total,
    payinProfitability.ww.providerMdrRows,
    payinProfitability.ww.providerTrxBreakdown.apmCost,
    payinProfitability.ww.providerTrxBreakdown.attemptsApm,
    payinProfitability.ww.providerTrxBreakdown.attemptsCc,
    payinProfitability.ww.providerTrxBreakdown.ccCost,
    payinProfitability.ww.revenue.total,
    payinWwPreview.mdrRevenue,
    payinWwPreview.tierRows,
    payinWwPreview.trxRevenue,
    payinWwPricing.model,
    payinWwPricing.rateMode,
    payinWwPricing.schemeFeesPercent,
    payinWwPricing.single.mdrPercent,
    payinWwPricing.trxFeeEnabled,
    payoutProfitability.costs.providerMdr,
    payoutProfitability.costs.providerTrx,
    payoutProfitability.costs.total,
    payoutProfitability.netMargin,
    payoutProfitability.providerMdrRows,
    payoutProfitability.revenue.mdr,
    payoutProfitability.revenue.total,
    payoutProfitability.revenue.trx,
    payoutRevenueAdjusted,
    payout.normalized.monthlyVolume,
    payout.normalized.totalTransactions,
    payoutPreview.tierRows,
    payoutPricing.rateMode,
    payoutMinimumFeeImpact.appliedPerTransactionRevenue,
    payoutMinimumFeeImpact.baseRevenue,
    payoutMinimumFeeImpact.warning,
    revShareIntroducer.sharePercent,
    revShareIntroducer.totalCosts,
    revShareIntroducer.totalRevenue,
    settlementFeeImpact.baseNet,
    settlementFeeImpact.chargeableNet,
    settlementFeeImpact.visible,
    settlementFeeEnabled,
    settlementFeeRatePercent,
    settlementIncluded,
    threeDsImpact.revenue,
    threeDsPayinRegionalBreakdown,
    threeDsRevenuePerSuccessfulTransaction,
    totalProfitability.introducerCommission,
    totalProfitability.marginBeforeIntroducer,
    totalProfitability.otherNetMargin,
    totalProfitability.ourMargin,
    totalProfitability.payinNetMargin,
    totalProfitability.payoutNetMargin,
    totalProfitability.revSharePercentApplied,
    totalProfitability.totalCosts,
    totalProfitability.totalRevenue,
    wwTrxRevenueApm,
    wwTrxRevenueCc
  ]);
  const unifiedExpandableNodeIds = useMemo(
    () => collectExpandableNodeIds(unifiedProfitabilityTree),
    [unifiedProfitabilityTree]
  );
  useEffect(() => {
    setUnifiedExpandedById(current => {
      const next: Record<string, boolean> = {};
      for (const id of unifiedExpandableNodeIds) {
        next[id] = id in current ? current[id] : true;
      }
      return next;
    });
  }, [unifiedExpandableNodeIds]);

  const expandAllUnifiedRows = () => {
    setUnifiedExpandedById(
      unifiedExpandableNodeIds.reduce<Record<string, boolean>>((acc, id) => {
        acc[id] = true;
        return acc;
      }, {})
    );
  };

  const collapseAllUnifiedRows = () => {
    setUnifiedExpandedById(
      unifiedExpandableNodeIds.reduce<Record<string, boolean>>((acc, id) => {
        acc[id] = false;
        return acc;
      }, {})
    );
  };

  const toggleUnifiedRow = (id: string) => {
    setUnifiedExpandedById(current => ({
      ...current,
      [id]: !(current[id] ?? true)
    }));
  };


  return {
    payin,
    payout,
    introducerBaseVolume,
    standardIntroducer,
    customIntroducer,
    payinEuPreview,
    payinWwPreview,
    payoutPreview,
    payoutRateMinimumAdjustments,
    payoutSingleRateMinimumAdjustment,
    payinBaseRevenue,
    payoutBaseRevenue,
    payinEffectiveTrxFeesByRegion,
    effectiveFailedTrxFees,
    payoutMinimumFeeImpact,
    payoutRevenueAdjusted,
    threeDsImpact,
    threeDsPayinRegionalBreakdown,
    settlementFeeImpact,
    monthlyMinimumFeeImpact,
    failedTrxImpact,
    failedTrxRevenueByRegion,
    payoutTrxRevenueAdjusted,
    payinProfitability,
    payoutProfitability,
    payinProfitabilityWithThreeDs,
    otherRevenueProfitability,
    revShareIntroducer,
    selectedIntroducerCommissionAmount,
    introducerCommissionAmount,
    totalProfitability,
    euTrxRevenueCc,
    euTrxRevenueApm,
    wwTrxRevenueCc,
    wwTrxRevenueApm,
    unifiedProfitabilityTree,
    unifiedExpandableNodeIds,
    expandAllUnifiedRows,
    collapseAllUnifiedRows,
    toggleUnifiedRow
  };
}
