import { useMemo, type Dispatch, type SetStateAction } from "react";
import {
  DEFAULT_PROVIDER_PAYIN_TRX_APM_COST,
  DEFAULT_PROVIDER_PAYIN_TRX_CC_COST,
  calculateOtherRevenueProfitability,
  calculatePayinProfitability,
  calculatePayoutProfitability,
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
  type PayoutPricingConfig
} from "../../domain/calculator/index.js";
import { resolveMethodTrxRevenue } from "./appHelpers.js";
import { buildUnifiedProfitabilityTree } from "./derived/buildUnifiedProfitabilityTree.js";
import { useUnifiedTreeExpansion } from "./derived/useUnifiedTreeExpansion.js";
import { usePricingPreviews } from "./derived/usePricingPreviews.js";
import { useFeeImpacts } from "./derived/useFeeImpacts.js";

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

  const {
    payinEuPreview,
    payinWwPreview,
    payoutPreview,
    payoutRateMinimumAdjustments,
    payoutSingleRateMinimumAdjustment,
    payinBaseRevenue,
    payoutBaseRevenue,
    payinEffectiveTrxFeesByRegion,
    effectiveFailedTrxFees,
  } = usePricingPreviews({
    calculatorType,
    payin,
    payout,
    payinEuPricing,
    payinWwPricing,
    payoutPricing,
  });

  const {
    payoutMinimumFeeImpact,
    payoutRevenueAdjusted,
    threeDsImpact,
    threeDsPayinRegionalBreakdown,
    settlementFeeImpact,
    monthlyMinimumFeeImpact,
    failedTrxImpact,
    failedTrxRevenueByRegion,
    payoutTrxRevenueAdjusted,
  } = useFeeImpacts({
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
  });
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
  const unifiedProfitabilityTree = useMemo(
    () =>
      buildUnifiedProfitabilityTree({
        calculatorType,
        introducerEnabled,
        introducerCommissionType,
        introducerCommissionAmount,
        totalProfitability,
        payin,
        payout,
        payinProfitability,
        payinProfitabilityWithThreeDs,
        payoutProfitability,
        otherRevenueProfitability,
        payinEuPricing,
        payinWwPricing,
        payinEuPreview,
        payinWwPreview,
        payoutPricing,
        payoutPreview,
        payoutMinimumFeeImpact,
        payoutRevenueAdjusted,
        settlementFeeImpact,
        settlementFeeEnabled,
        settlementFeeRatePercent,
        monthlyMinimumFeeAmount,
        monthlyMinimumFeeImpact,
        failedTrxRevenueByRegion,
        revShareIntroducer,
        payinBaseRevenue,
        threeDsImpactRevenue: threeDsImpact.revenue,
        threeDsPayinRegionalBreakdown,
        threeDsRevenuePerSuccessfulTransaction,
        euTrxRevenueCc,
        euTrxRevenueApm,
        wwTrxRevenueCc,
        wwTrxRevenueApm
      }),
    [
      calculatorType,
      introducerEnabled,
      introducerCommissionType,
      introducerCommissionAmount,
      totalProfitability,
      payin,
      payout,
      payinProfitability,
      payinProfitabilityWithThreeDs,
      payoutProfitability,
      otherRevenueProfitability,
      payinEuPricing,
      payinWwPricing,
      payinEuPreview,
      payinWwPreview,
      payoutPricing,
      payoutPreview,
      payoutMinimumFeeImpact,
      payoutRevenueAdjusted,
      settlementFeeImpact,
      settlementFeeEnabled,
      settlementFeeRatePercent,
      monthlyMinimumFeeAmount,
      monthlyMinimumFeeImpact,
      failedTrxRevenueByRegion,
      revShareIntroducer,
      payinBaseRevenue,
      threeDsImpact.revenue,
      threeDsPayinRegionalBreakdown,
      threeDsRevenuePerSuccessfulTransaction,
      euTrxRevenueCc,
      euTrxRevenueApm,
      wwTrxRevenueCc,
      wwTrxRevenueApm
    ]
  );

  const { unifiedExpandableNodeIds, expandAllUnifiedRows, collapseAllUnifiedRows, toggleUnifiedRow } =
    useUnifiedTreeExpansion({ unifiedProfitabilityTree, setUnifiedExpandedById });

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
