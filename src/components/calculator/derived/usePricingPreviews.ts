import { useMemo } from "react";
import {
  calculatePayinRegionPricingPreview,
  calculatePayoutPricingPreview,
  type CalculatorTypeSelection,
  type PayinRegionPricingConfig,
  type PayinRegionPricingPreview,
  type PayoutPricingConfig,
  type PayoutPricingPreview,
  type PayoutRateMinimumAdjustment,
  type PayinTrafficDerived,
  type PayoutTrafficDerived,
} from "../../../domain/calculator/index.js";
import { resolveEffectiveMethodTrxFee } from "../appHelpers.js";

export interface UsePricingPreviewsParams {
  calculatorType: CalculatorTypeSelection;
  payin: PayinTrafficDerived;
  payout: PayoutTrafficDerived;
  payinEuPricing: PayinRegionPricingConfig;
  payinWwPricing: PayinRegionPricingConfig;
  payoutPricing: PayoutPricingConfig;
}

export interface UsePricingPreviewsResult {
  payinEuPreview: PayinRegionPricingPreview;
  payinWwPreview: PayinRegionPricingPreview;
  payoutPreview: PayoutPricingPreview;
  payoutRateMinimumAdjustments: PayoutRateMinimumAdjustment[];
  payoutSingleRateMinimumAdjustment: PayoutRateMinimumAdjustment | null;
  payinBaseRevenue: number;
  payoutBaseRevenue: number;
  payinEffectiveTrxFeesByRegion: {
    eu: { ccFee: number; apmFee: number };
    ww: { ccFee: number; apmFee: number };
  };
  effectiveFailedTrxFees: { ccFee: number; apmFee: number };
}

export function usePricingPreviews(params: UsePricingPreviewsParams): UsePricingPreviewsResult {
  const {
    calculatorType,
    payin,
    payout,
    payinEuPricing,
    payinWwPricing,
    payoutPricing,
  } = params;

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
    const euApmFee = resolveEffectiveMethodTrxFee(payinEuPricing, payinEuPreview, "apm");
    const wwCcFee = resolveEffectiveMethodTrxFee(payinWwPricing, payinWwPreview, "cc");
    const wwApmFee = resolveEffectiveMethodTrxFee(payinWwPricing, payinWwPreview, "apm");
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

  return {
    payinEuPreview,
    payinWwPreview,
    payoutPreview,
    payoutRateMinimumAdjustments,
    payoutSingleRateMinimumAdjustment,
    payinBaseRevenue,
    payoutBaseRevenue,
    payinEffectiveTrxFeesByRegion,
    effectiveFailedTrxFees,
  };
}
