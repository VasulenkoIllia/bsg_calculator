import {
  DEFAULT_3DS_FEE_CONFIG,
  DEFAULT_PROVIDER_PAYIN_TRX_APM_COST,
  DEFAULT_PROVIDER_PAYIN_TRX_CC_COST,
  formatAmount2,
  formatAmountInteger,
  formatVariableAmount,
  type CalculatorTypeSelection,
  type PayinRegionPricingConfig,
  type PayinRegionPricingPreview,
  type PayinProfitabilityResult,
  type PayinTrafficDerived,
} from "../../../domain/calculator/index.js";
import { formatCount, formatInputNumber } from "../index.js";
import type { UnifiedProfitabilityNode } from "../types.js";

export interface BuildPayinSubtreeParams {
  calculatorType: CalculatorTypeSelection;
  payin: PayinTrafficDerived;
  payinEuPricing: PayinRegionPricingConfig;
  payinWwPricing: PayinRegionPricingConfig;
  payinEuPreview: PayinRegionPricingPreview;
  payinWwPreview: PayinRegionPricingPreview;
  payinProfitability: PayinProfitabilityResult;
  payinProfitabilityWithThreeDs: {
    revenue: { total: number };
    costs: { total: number };
    netMargin: number;
  };
  failedTrxRevenueByRegion: { eu: number; ww: number };
  threeDsPayinRegionalBreakdown: {
    eu: { revenue: number; cost: number; successfulTransactions: number; attempts: number };
    ww: { revenue: number; cost: number; successfulTransactions: number; attempts: number };
  };
  threeDsRevenuePerSuccessfulTransaction: number;
  euTrxRevenueCc: number;
  euTrxRevenueApm: number;
  wwTrxRevenueCc: number;
  wwTrxRevenueApm: number;
}

function buildPayinCostChildren(
  regionKey: "eu" | "ww",
  regionLabel: "EU" | "WW",
  pricing: PayinRegionPricingConfig,
  volume: number,
  payinProfitability: PayinProfitabilityResult
): UnifiedProfitabilityNode[] {
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
}

function buildPayinCostFormula(
  regionLabel: "EU" | "WW",
  profitability: PayinProfitabilityResult["eu"],
  pricing: PayinRegionPricingConfig
): string {
  const parts = [
    `Provider MDR (${formatAmount2(profitability.costs.providerMdr)})`,
    `Provider TRX (${formatAmount2(profitability.costs.providerTrx)})`
  ];

  if (pricing.model === "blended") {
    parts.push(`Scheme Fees (${formatAmount2(profitability.costs.schemeFees)})`);
  }

  return `${regionLabel} Costs = ${parts.join(" + ")}`;
}

function buildTotalPayinCostFormula(
  payinProfitability: PayinProfitabilityResult,
  payinProfitabilityWithThreeDs: BuildPayinSubtreeParams["payinProfitabilityWithThreeDs"],
  threeDsPayinRegionalBreakdown: BuildPayinSubtreeParams["threeDsPayinRegionalBreakdown"],
  payinEuPricing: PayinRegionPricingConfig,
  payinWwPricing: PayinRegionPricingConfig
): string {
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
}

export function buildPayinSubtree(params: BuildPayinSubtreeParams): UnifiedProfitabilityNode | null {
  const {
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
    wwTrxRevenueApm,
  } = params;

  if (!calculatorType.payin) return null;

  return {
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
        formula: buildTotalPayinCostFormula(
          payinProfitability,
          payinProfitabilityWithThreeDs,
          threeDsPayinRegionalBreakdown,
          payinEuPricing,
          payinWwPricing
        ),
        children: [
          {
            id: "unified-payin-eu-costs",
            label: "EU Costs",
            value: -payinProfitability.eu.costs.total,
            formula: buildPayinCostFormula("EU", payinProfitability.eu, payinEuPricing),
            children: buildPayinCostChildren("eu", "EU", payinEuPricing, payin.volume.eu, payinProfitability)
          },
          {
            id: "unified-payin-ww-costs",
            label: "WW Costs",
            value: -payinProfitability.ww.costs.total,
            formula: buildPayinCostFormula("WW", payinProfitability.ww, payinWwPricing),
            children: buildPayinCostChildren("ww", "WW", payinWwPricing, payin.volume.ww, payinProfitability)
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
  };
}
