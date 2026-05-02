import {
  formatAmount2,
  formatAmountInteger,
  formatVariableAmount,
  type CalculatorTypeSelection,
  type PayoutPricingConfig,
  type PayoutPricingPreview,
  type PayoutTrafficDerived,
} from "../../../domain/calculator/index.js";
import { formatCount, formatInputNumber } from "../index.js";
import type { UnifiedProfitabilityNode } from "../types.js";

export interface PayoutProfitabilityShape {
  revenue: {
    mdr: number;
    trx: number;
    total: number;
  };
  costs: {
    providerMdr: number;
    providerTrx: number;
    total: number;
  };
  providerMdrRows: Array<{
    label: string;
    volume: number;
    ratePercent: number;
    cost: number;
  }>;
  providerTrxRows: Array<{
    label: string;
    transactions: number;
    feePerTransaction: number;
    cost: number;
  }>;
  netMargin: number;
}

export interface BuildPayoutSubtreeParams {
  calculatorType: CalculatorTypeSelection;
  payout: PayoutTrafficDerived;
  payoutPricing: PayoutPricingConfig;
  payoutPreview: PayoutPricingPreview;
  payoutProfitability: PayoutProfitabilityShape;
  payoutMinimumFeeImpact: {
    warning: string | null;
    baseRevenue: number;
    appliedPerTransactionRevenue: number;
  };
}

export function buildPayoutSubtree(params: BuildPayoutSubtreeParams): UnifiedProfitabilityNode | null {
  const {
    calculatorType,
    payout,
    payoutPricing,
    payoutPreview,
    payoutProfitability,
    payoutMinimumFeeImpact,
  } = params;

  if (!calculatorType.payout) return null;

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

  return {
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
  };
}
