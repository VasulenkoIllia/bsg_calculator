import {
  formatAmount2,
  formatAmountInteger,
  type CalculatorTypeSelection,
  type IntroducerCommissionType,
  type MonthlyMinimumFeeImpact,
  type OtherRevenueProfitabilityResult,
  type PayinProfitabilityResult,
  type PayinRegionPricingConfig,
  type PayinRegionPricingPreview,
  type PayinTrafficDerived,
  type PayoutMinimumFeeImpact,
  type PayoutPricingConfig,
  type PayoutPricingPreview,
  type PayoutProfitabilityResult,
  type PayoutTrafficDerived,
  type RevShareResult,
  type SettlementFeeImpact,
  type TotalProfitabilityResult
} from "../../../domain/calculator/index.js";
import { formatInputNumber } from "../numberUtils.js";
import type { UnifiedProfitabilityNode } from "../types.js";
import { buildPayinSubtree } from "./buildPayinSubtree.js";
import { buildPayoutSubtree } from "./buildPayoutSubtree.js";

type FailedTrxRevenueByRegion = {
  eu: number;
  ww: number;
};

type ThreeDsPayinRegionalBreakdown = {
  eu: {
    successfulTransactions: number;
    attempts: number;
    revenue: number;
    cost: number;
    net: number;
  };
  ww: {
    successfulTransactions: number;
    attempts: number;
    revenue: number;
    cost: number;
    net: number;
  };
  total: {
    revenue: number;
    cost: number;
    net: number;
  };
};

export type BuildUnifiedProfitabilityTreeParams = {
  calculatorType: CalculatorTypeSelection;
  introducerEnabled: boolean;
  introducerCommissionType: IntroducerCommissionType;
  introducerCommissionAmount: number;
  totalProfitability: TotalProfitabilityResult;
  payin: PayinTrafficDerived;
  payout: PayoutTrafficDerived;
  payinProfitability: PayinProfitabilityResult;
  payinProfitabilityWithThreeDs: PayinProfitabilityResult;
  payoutProfitability: PayoutProfitabilityResult;
  otherRevenueProfitability: OtherRevenueProfitabilityResult;
  payinEuPricing: PayinRegionPricingConfig;
  payinWwPricing: PayinRegionPricingConfig;
  payinEuPreview: PayinRegionPricingPreview;
  payinWwPreview: PayinRegionPricingPreview;
  payoutPricing: PayoutPricingConfig;
  payoutPreview: PayoutPricingPreview;
  payoutMinimumFeeImpact: PayoutMinimumFeeImpact;
  payoutRevenueAdjusted: number;
  settlementFeeImpact: SettlementFeeImpact;
  settlementFeeEnabled: boolean;
  settlementFeeRatePercent: number;
  monthlyMinimumFeeAmount: number;
  monthlyMinimumFeeImpact: MonthlyMinimumFeeImpact;
  failedTrxRevenueByRegion: FailedTrxRevenueByRegion;
  revShareIntroducer: RevShareResult;
  payinBaseRevenue: number;
  threeDsImpactRevenue: number;
  threeDsPayinRegionalBreakdown: ThreeDsPayinRegionalBreakdown;
  threeDsRevenuePerSuccessfulTransaction: number;
  euTrxRevenueCc: number;
  euTrxRevenueApm: number;
  wwTrxRevenueCc: number;
  wwTrxRevenueApm: number;
};

export function buildUnifiedProfitabilityTree({
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
  threeDsImpactRevenue,
  threeDsPayinRegionalBreakdown,
  threeDsRevenuePerSuccessfulTransaction,
  euTrxRevenueCc,
  euTrxRevenueApm,
  wwTrxRevenueCc,
  wwTrxRevenueApm
}: BuildUnifiedProfitabilityTreeParams): UnifiedProfitabilityNode[] {
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

  nodes.push({
    id: "unified-total-profitability",
    label: "TOTAL PROFITABILITY",
    value: totalProfitability.ourMargin,
    formula: `Final Profitability Result = Our Margin (${formatAmount2(totalProfitability.ourMargin)})`,
    children: totalChildren
  });

  const payinNode = buildPayinSubtree({
    calculatorType,
    payin,
    payinEuPricing,
    payinWwPricing,
    payinEuPreview,
    payinWwPreview,
    payinProfitability,
    payinProfitabilityWithThreeDs,
    failedTrxRevenueByRegion,
    threeDsPayinRegionalBreakdown,
    threeDsRevenuePerSuccessfulTransaction,
    euTrxRevenueCc,
    euTrxRevenueApm,
    wwTrxRevenueCc,
    wwTrxRevenueApm
  });
  if (payinNode) nodes.push(payinNode);

  const payoutNode = buildPayoutSubtree({
    calculatorType,
    payout,
    payoutPricing,
    payoutPreview,
    payoutProfitability,
    payoutMinimumFeeImpact
  });
  if (payoutNode) nodes.push(payoutNode);

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
              payinBaseRevenue + threeDsImpactRevenue
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
}
