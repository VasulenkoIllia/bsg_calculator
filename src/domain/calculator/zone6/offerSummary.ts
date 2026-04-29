import type {
  CustomCommissionResult,
  IntroducerCommissionType,
  RevShareResult,
  StandardCommissionResult
} from "../zone2/introducerCommission.js";
import type {
  PayinRegionPricingConfig,
  PayoutPricingConfig
} from "../zone3/pricingConfiguration.js";
import type {
  ContractSummarySettings,
  FailedTrxChargingMode
} from "../zone4/otherFeesAndLimits.js";
import type { PayinTrafficDerived, PayoutTrafficDerived } from "../zone1/traffic.js";
import { formatAmount2, formatAmountInteger } from "../shared/format.js";

export interface OfferSummaryInput {
  generatedAt?: Date;
  clientNotes?: string;
  calculatorType: {
    payin: boolean;
    payout: boolean;
  };
  payin: Pick<PayinTrafficDerived, "normalized" | "averageTransaction" | "volume">;
  payout: Pick<PayoutTrafficDerived, "normalized" | "averageTransaction">;
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
  contractSummary: ContractSummarySettings;
  introducerEnabled: boolean;
  introducerCommissionType: IntroducerCommissionType;
  standardIntroducer: StandardCommissionResult;
  customIntroducer: CustomCommissionResult;
  revShareIntroducer: RevShareResult;
}

const TITLE_BAR = "===================================================";
const SECTION_BAR = "---------------------------------------------------";

function safeFinite(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value;
}

function safeNonNegative(value: number): number {
  return Math.max(0, safeFinite(value));
}

function formatCount(value: number): string {
  return Math.round(safeNonNegative(value)).toLocaleString("en-US");
}

function formatPercent(value: number, fractionDigits: number): string {
  return `${safeFinite(value).toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits
  })}%`;
}

function formatMillion(value: number): string {
  return `${(safeFinite(value) / 1_000_000).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}M`;
}

function formatDateTime(value: Date): string {
  const date = Number.isFinite(value.getTime()) ? value : new Date(0);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${day}/${month}/${year}, ${hours}:${minutes}:${seconds}`;
}

function formatPricingModel(model: "icpp" | "blended"): string {
  return model === "icpp" ? "IC++" : "Blended";
}

function toTierBoundaryLabel(value: number): string {
  return `${safeNonNegative(value).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })}`;
}

function formatThresholdMillion(value: number): string {
  return safeNonNegative(value).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function formatPayoutMinimumFeeClause(thresholdMillion: number, feePerTransaction: number): string {
  const threshold = formatThresholdMillion(thresholdMillion);
  return `<=€${threshold}M: ${formatAmount2(feePerTransaction)} / >€${threshold}M: N/A`;
}

function buildPayinRegionPricingLines(
  regionLabel: string,
  pricing: PayinRegionPricingConfig
): string[] {
  const lines: string[] = [];
  const tier1 = toTierBoundaryLabel(pricing.tier1UpToMillion);
  const tier2 = toTierBoundaryLabel(Math.max(pricing.tier1UpToMillion, pricing.tier2UpToMillion));

  lines.push(`${regionLabel}:`);
  lines.push(`Model: ${formatPricingModel(pricing.model)}`);
  lines.push(`TRX Fee Enabled: ${pricing.trxFeeEnabled ? "Yes" : "No"}`);

  if (pricing.rateMode === "tiered") {
    lines.push("Tiers: Enabled");
    lines.push(
      `Tier 1 (€0-€${tier1}M): ${formatPercent(
        pricing.tiers[0].mdrPercent,
        2
      )} / ${formatAmount2(pricing.tiers[0].trxCc)} CC + ${formatAmount2(
        pricing.tiers[0].trxApm
      )} APM`
    );
    lines.push(
      `Tier 2 (€${tier1}M-€${tier2}M): ${formatPercent(
        pricing.tiers[1].mdrPercent,
        2
      )} / ${formatAmount2(pricing.tiers[1].trxCc)} CC + ${formatAmount2(
        pricing.tiers[1].trxApm
      )} APM`
    );
    lines.push(
      `Tier 3 (>€${tier2}M): ${formatPercent(
        pricing.tiers[2].mdrPercent,
        2
      )} / ${formatAmount2(pricing.tiers[2].trxCc)} CC + ${formatAmount2(
        pricing.tiers[2].trxApm
      )} APM`
    );
  } else {
    lines.push("Tiers: Disabled");
    lines.push(`MDR: ${formatPercent(pricing.single.mdrPercent, 2)}`);
    lines.push(`TRX CC: ${formatAmount2(pricing.single.trxCc)}`);
    lines.push(`TRX APM: ${formatAmount2(pricing.single.trxApm)}`);
  }

  if (pricing.model === "blended") {
    lines.push(`Scheme Fees: ${formatPercent(pricing.schemeFeesPercent, 2)}`);
  } else {
    lines.push("Scheme Fees: N/A in IC++ (pass-through)");
  }

  return lines;
}

function buildPayoutPricingLines(
  pricing: PayoutPricingConfig,
  payoutMinimumFeeEnabled: boolean,
  payoutMinimumFeePerTransaction: number
): string[] {
  const lines: string[] = [];
  const tier1 = toTierBoundaryLabel(pricing.tier1UpToMillion);
  const tier2 = toTierBoundaryLabel(Math.max(pricing.tier1UpToMillion, pricing.tier2UpToMillion));

  if (pricing.rateMode === "tiered") {
    lines.push("Tiers: Enabled");
    lines.push(
      `Tier 1 (€0-€${tier1}M): ${formatPercent(pricing.tiers[0].mdrPercent, 2)} / ${formatAmount2(
        pricing.tiers[0].trxFee
      )}`
    );
    lines.push(
      `Tier 2 (€${tier1}M-€${tier2}M): ${formatPercent(
        pricing.tiers[1].mdrPercent,
        2
      )} / ${formatAmount2(pricing.tiers[1].trxFee)}`
    );
    lines.push(
      `Tier 3 (>€${tier2}M): ${formatPercent(pricing.tiers[2].mdrPercent, 2)} / ${formatAmount2(
        pricing.tiers[2].trxFee
      )}`
    );
  } else {
    lines.push("Tiers: Disabled");
    lines.push(`MDR: ${formatPercent(pricing.single.mdrPercent, 2)}`);
    lines.push(`TRX Fee: ${formatAmount2(pricing.single.trxFee)}`);
  }

  if (payoutMinimumFeeEnabled) {
    lines.push(
      `Minimum Fee: ${formatAmount2(
        safeNonNegative(payoutMinimumFeePerTransaction)
      )} per transaction`
    );
  }

  return lines;
}

function buildAdditionalFeesLines(input: OfferSummaryInput): string[] {
  const lines: string[] = [];

  if (input.calculatorType.payin && input.threeDsEnabled) {
    lines.push(
      `3DS Fee: Enabled (${formatAmount2(
        safeNonNegative(input.threeDsRevenuePerSuccessfulTransaction)
      )} per successful transaction)`
    );
  }

  if (input.settlementIncluded) {
    lines.push("Settlement Fee: Included in pricing");
  } else if (input.settlementFeeEnabled) {
    lines.push(`Settlement Fee: Enabled (${formatPercent(input.settlementFeeRatePercent, 2)})`);
  }

  if (input.monthlyMinimumFeeEnabled) {
    lines.push(`Monthly Minimum: ${formatAmountInteger(input.monthlyMinimumFeeAmount)}`);
  }

  if (input.calculatorType.payout && input.payoutMinimumFeeEnabled) {
    lines.push(
      `Payout Minimum Fee: ${formatAmount2(
        safeNonNegative(input.payoutMinimumFeePerTransaction)
      )} per transaction`
    );
  }

  if (input.calculatorType.payin && input.failedTrxEnabled) {
    if (input.failedTrxMode === "allFailedVolume") {
      lines.push("Failed TRX: All failed volume charged");
    } else {
      lines.push(
        `Failed TRX: Over limit only (threshold ${formatPercent(
          input.failedTrxOverLimitThresholdPercent,
          0
        )})`
      );
    }
  }

  if (lines.length === 0) {
    lines.push("No additional enabled fees");
  }

  return lines;
}

function buildIntroducerLines(input: OfferSummaryInput): string[] {
  if (!input.introducerEnabled) {
    return ["Agent / Introducer: No", "Introducer Commission: Not applied"];
  }

  if (input.introducerCommissionType === "standard") {
    return [
      "Agent / Introducer: Yes",
      "Type: Standard",
      `Volume: ${formatMillion(input.standardIntroducer.volumeEuro)}`,
      `Tier: ${input.standardIntroducer.appliedTier.label}`,
      `Rate: ${formatAmountInteger(input.standardIntroducer.appliedTier.ratePerMillion)} per €1M`,
      `Total Commission: ${formatAmount2(input.standardIntroducer.totalCommission)}`
    ];
  }

  if (input.introducerCommissionType === "custom") {
    const lines: string[] = [
      "Agent / Introducer: Yes",
      "Type: Custom (Progressive)",
      `Volume: ${formatMillion(input.customIntroducer.volumeEuro)}`
    ];

    for (const row of input.customIntroducer.tiers) {
      lines.push(
        `${row.tier.label}: ${row.volumeMillionInTier.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })}M × ${formatAmountInteger(row.tier.ratePerMillion)} = ${formatAmount2(row.commission)}`
      );
    }

    lines.push(`Total Commission: ${formatAmount2(input.customIntroducer.totalCommission)}`);
    return lines;
  }

  return [
    "Agent / Introducer: Yes",
    "Type: Rev Share",
    `Total Revenue: ${formatAmount2(input.revShareIntroducer.totalRevenue)}`,
    `Total Costs: ${formatAmount2(input.revShareIntroducer.totalCosts)}`,
    `Margin Before Split: ${formatAmount2(input.revShareIntroducer.marginBeforeSplit)}`,
    `Partner Share (${formatPercent(input.revShareIntroducer.sharePercent, 0)}): ${formatAmount2(
      input.revShareIntroducer.partnerShare
    )}`,
    `Our Margin: ${formatAmount2(input.revShareIntroducer.ourMargin)}`
  ];
}

export function buildOfferSummaryText(input: OfferSummaryInput): string {
  const generatedAt = input.generatedAt ?? new Date();
  const lines: string[] = [];
  const note = input.clientNotes?.trim();

  lines.push(TITLE_BAR);
  lines.push("BSG CALCULATOR - OFFER SUMMARY");
  lines.push(TITLE_BAR);
  lines.push(`Generated: ${formatDateTime(generatedAt)}`);
  if (note) {
    lines.push(`CLIENT NOTES: ${note}`);
  }

  lines.push(SECTION_BAR);
  lines.push("1. CLIENT PARAMETERS");
  lines.push(SECTION_BAR);
  if (input.calculatorType.payin) {
    lines.push("PAYIN:");
    lines.push(`Monthly Volume: ${formatAmountInteger(input.payin.normalized.monthlyVolume)}`);
    lines.push(
      `Amount Transactions: ${formatCount(input.payin.normalized.successfulTransactions)}`
    );
    lines.push(`Average Transaction: ${formatAmount2(input.payin.averageTransaction)}`);
    lines.push(`Approval Ratio: ${formatPercent(input.payin.normalized.approvalRatioPercent, 0)}`);
    lines.push("Regional Split:");
    lines.push(
      `EU: ${formatAmountInteger(input.payin.volume.eu)} (${formatPercent(
        input.payin.normalized.euPercent,
        0
      )})`
    );
    lines.push(
      `Worldwide: ${formatAmountInteger(input.payin.volume.ww)} (${formatPercent(
        input.payin.normalized.wwPercent,
        0
      )})`
    );
    lines.push("Payment Split:");
    lines.push(
      `Credit Card: ${formatAmountInteger(input.payin.volume.cc)} (${formatPercent(
        input.payin.normalized.ccPercent,
        0
      )})`
    );
    lines.push(
      `APM: ${formatAmountInteger(input.payin.volume.apm)} (${formatPercent(
        input.payin.normalized.apmPercent,
        0
      )})`
    );
  }
  if (input.calculatorType.payout) {
    lines.push("PAYOUT:");
    lines.push(`Monthly Volume: ${formatAmountInteger(input.payout.normalized.monthlyVolume)}`);
    lines.push(`Total Transactions: ${formatCount(input.payout.normalized.totalTransactions)}`);
    lines.push(`Average Transaction: ${formatAmount2(input.payout.averageTransaction)}`);
  }

  lines.push(SECTION_BAR);
  lines.push("2. PRICING");
  lines.push(SECTION_BAR);
  if (input.calculatorType.payin) {
    lines.push("PAYIN:");
    lines.push(`Settlement Included: ${input.settlementIncluded ? "Yes" : "No"}`);
    lines.push(...buildPayinRegionPricingLines("EU (Europe)", input.payinEuPricing));
    lines.push(...buildPayinRegionPricingLines("WW (Worldwide)", input.payinWwPricing));
  }
  if (input.calculatorType.payout) {
    lines.push("PAYOUT:");
    lines.push(
      ...buildPayoutPricingLines(
        input.payoutPricing,
        input.payoutMinimumFeeEnabled,
        input.payoutMinimumFeePerTransaction
      )
    );
  }
  if (!input.calculatorType.payin && !input.calculatorType.payout) {
    lines.push("No pricing blocks enabled");
  }

  lines.push(SECTION_BAR);
  lines.push("3. ADDITIONAL FEES");
  lines.push(SECTION_BAR);
  lines.push(...buildAdditionalFeesLines(input));

  lines.push(SECTION_BAR);
  lines.push("4. TRANSACTION LIMITS");
  lines.push(SECTION_BAR);
  lines.push(`Settlement Period: ${input.contractSummary.settlementPeriod}`);
  lines.push(`Min Collection Size: ${formatAmountInteger(input.contractSummary.collectionLimitMin)}`);
  lines.push(`Max Collection Size: ${formatAmountInteger(input.contractSummary.collectionLimitMax)}`);
  lines.push(`Min Payout Size: ${formatAmountInteger(input.contractSummary.payoutLimitMin)}`);
  lines.push(
    `Max Payout Size: ${
      input.contractSummary.payoutLimitMax === null
        ? "N/A"
        : formatAmountInteger(input.contractSummary.payoutLimitMax)
    }`
  );
  if (input.calculatorType.payin) {
    if (input.contractSummary.payoutMinimumFeeMode === "overall") {
      lines.push(
        `Payin Minimum Fee: ${formatPayoutMinimumFeeClause(
          input.contractSummary.payoutMinimumFeeThresholdMillion,
          input.contractSummary.payoutMinimumFeePerTransaction
        )}`
      );
    } else {
      lines.push(
        `Payin Minimum Fee EU: ${formatPayoutMinimumFeeClause(
          input.contractSummary.payoutMinimumFeeEuThresholdMillion,
          input.contractSummary.payoutMinimumFeeEuPerTransaction
        )}`
      );
      lines.push(
        `Payin Minimum Fee WW: ${formatPayoutMinimumFeeClause(
          input.contractSummary.payoutMinimumFeeWwThresholdMillion,
          input.contractSummary.payoutMinimumFeeWwPerTransaction
        )}`
      );
    }
  }
  lines.push(
    `Rolling Reserve: ${formatPercent(
      input.contractSummary.rollingReservePercent,
      0
    )} for ${formatCount(input.contractSummary.rollingReserveHoldDays)} days (cap: ${
      input.contractSummary.rollingReserveCap === null
        ? "N/A"
        : formatAmountInteger(input.contractSummary.rollingReserveCap)
    })`
  );

  lines.push(SECTION_BAR);
  lines.push("5. CONTRACT SUMMARY");
  lines.push(SECTION_BAR);
  lines.push(`Account Setup: ${formatAmount2(input.contractSummary.accountSetupFee)} (one-time)`);
  lines.push(`Refund: ${formatAmount2(input.contractSummary.refundCost)} per transaction`);
  lines.push(`Dispute/Chargeback: ${formatAmount2(input.contractSummary.disputeCost)} per transaction`);

  lines.push(SECTION_BAR);
  lines.push("6. INTRODUCER COMMISSION");
  lines.push(SECTION_BAR);
  lines.push(...buildIntroducerLines(input));

  lines.push(TITLE_BAR);
  lines.push("END OF SUMMARY");
  lines.push(TITLE_BAR);

  return lines.join("\n");
}
