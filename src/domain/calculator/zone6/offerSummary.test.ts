import { describe, expect, it } from "vitest";
import {
  calculateCustomIntroducerCommission,
  calculateRevShareIntroducerCommission,
  calculateStandardIntroducerCommission
} from "../zone2/introducerCommission.js";
import {
  DEFAULT_PAYIN_EU_PRICING_CONFIG,
  DEFAULT_PAYIN_WW_PRICING_CONFIG,
  DEFAULT_PAYOUT_PRICING_CONFIG
} from "../zone3/pricingConfiguration.js";
import { DEFAULT_CONTRACT_SUMMARY_SETTINGS } from "../zone4/otherFeesAndLimits.js";
import { derivePayinTraffic, derivePayoutTraffic } from "../zone1/traffic.js";
import { buildOfferSummaryText, type OfferSummaryInput } from "./offerSummary.js";

function buildBaseInput(overrides: Partial<OfferSummaryInput> = {}): OfferSummaryInput {
  const payin = derivePayinTraffic({
    monthlyVolume: 15_000_000,
    successfulTransactions: 21_000,
    approvalRatioPercent: 80,
    euPercent: 50,
    ccPercent: 70
  });
  const payout = derivePayoutTraffic({
    monthlyVolume: 500_000,
    totalTransactions: 5_000
  });
  const baseVolume = payin.normalized.monthlyVolume;
  const standardIntroducer = calculateStandardIntroducerCommission(baseVolume);
  const customIntroducer = calculateCustomIntroducerCommission(baseVolume);
  const revShareIntroducer = calculateRevShareIntroducerCommission({
    totalRevenue: 150_000,
    totalCosts: 100_000,
    sharePercent: 25
  });

  return {
    generatedAt: new Date("2026-04-22T09:15:30"),
    clientNotes: "",
    calculatorType: { payin: true, payout: true },
    payin,
    payout,
    settlementIncluded: true,
    payinEuPricing: DEFAULT_PAYIN_EU_PRICING_CONFIG,
    payinWwPricing: DEFAULT_PAYIN_WW_PRICING_CONFIG,
    payoutPricing: DEFAULT_PAYOUT_PRICING_CONFIG,
    payoutMinimumFeeEnabled: false,
    payoutMinimumFeePerTransaction: 2.5,
    threeDsEnabled: false,
    threeDsRevenuePerSuccessfulTransaction: 0.05,
    settlementFeeEnabled: false,
    settlementFeeRatePercent: 0.3,
    monthlyMinimumFeeEnabled: false,
    monthlyMinimumFeeAmount: 5_000,
    failedTrxEnabled: false,
    failedTrxMode: "overLimitOnly",
    failedTrxOverLimitThresholdPercent: 70,
    contractSummary: DEFAULT_CONTRACT_SUMMARY_SETTINGS,
    introducerEnabled: true,
    introducerCommissionType: "standard",
    standardIntroducer,
    customIntroducer,
    revShareIntroducer,
    ...overrides
  };
}

describe("buildOfferSummaryText", () => {
  it("includes payin and payout sections with deterministic generated timestamp", () => {
    const input = buildBaseInput({
      clientNotes: "Pilot merchant"
    });

    const summary = buildOfferSummaryText(input);

    expect(summary).toContain("BSG CALCULATOR - OFFER SUMMARY");
    expect(summary).toContain("Generated: 22/04/2026, 09:15:30");
    expect(summary).toContain("CLIENT NOTES: Pilot merchant");
    expect(summary).toContain("PAYIN:");
    expect(summary).toContain("PAYOUT:");
    expect(summary).toContain("Settlement Included: Yes");
    expect(summary).toContain("TRX Fee Enabled: Yes");
    expect(summary).toContain("Agent / Introducer: Yes");
    expect(summary).toContain("Type: Standard");
    expect(summary).toContain("Total Commission: €75,000");
    expect(summary).toContain("Min Collection Size: €1");
    expect(summary).toContain("Max Collection Size: €2,500");
    expect(summary).toContain("Min Payout Size: €60");
    expect(summary).toContain("Max Payout Size: N/A");
    expect(summary).toContain("Payin Minimum Fee: <=€2.5M: €1 / >€2.5M: N/A");
  });

  it("shows tier rows for tiered models and includes enabled options only", () => {
    const input = buildBaseInput({
      payinEuPricing: {
        ...DEFAULT_PAYIN_EU_PRICING_CONFIG,
        rateMode: "tiered"
      },
      payoutPricing: {
        ...DEFAULT_PAYOUT_PRICING_CONFIG,
        rateMode: "tiered"
      },
      threeDsEnabled: true,
      monthlyMinimumFeeEnabled: true,
      payoutMinimumFeeEnabled: true,
      failedTrxEnabled: true,
      failedTrxMode: "allFailedVolume"
    });

    const summary = buildOfferSummaryText(input);

    expect(summary).toContain("Tier 1 (€0-€5M): 4.50% / €0.35 CC + €0.35 APM");
    expect(summary).toContain("Tier 1 (€0-€1M): 2.00% / €0.5");
    expect(summary).toContain("3DS Fee: Enabled (€0.05 per successful transaction)");
    expect(summary).toContain("Monthly Minimum: €5,000");
    expect(summary).toContain("Payout Minimum Fee: €2.5 per transaction");
    expect(summary).toContain("Payin Minimum Fee: <=€2.5M: €1 / >€2.5M: N/A");
    expect(summary).toContain("Failed TRX: All failed volume charged");
    expect(summary).not.toContain("No additional enabled fees");
  });

  it("supports payin minimum fee contract summary by EU and WW", () => {
    const input = buildBaseInput({
      contractSummary: {
        ...DEFAULT_CONTRACT_SUMMARY_SETTINGS,
        payoutMinimumFeeMode: "byRegion",
        payoutMinimumFeeEuThresholdMillion: 2.5,
        payoutMinimumFeeEuPerTransaction: 1,
        payoutMinimumFeeWwThresholdMillion: 5,
        payoutMinimumFeeWwPerTransaction: 2
      }
    });

    const summary = buildOfferSummaryText(input);

    expect(summary).toContain("Payin Minimum Fee EU: <=€2.5M: €1 / >€2.5M: N/A");
    expect(summary).toContain("Payin Minimum Fee WW: <=€5M: €2 / >€5M: N/A");
  });

  it("supports rev share output and skips inactive payout blocks", () => {
    const input = buildBaseInput({
      calculatorType: { payin: true, payout: false },
      settlementIncluded: false,
      settlementFeeEnabled: true,
      settlementFeeRatePercent: 0.75,
      introducerCommissionType: "revShare"
    });

    const summary = buildOfferSummaryText(input);

    expect(summary).not.toContain("PAYOUT:");
    expect(summary).toContain("Payin Minimum Fee: <=€2.5M: €1 / >€2.5M: N/A");
    expect(summary).toContain("Settlement Fee: Enabled (0.75%)");
    expect(summary).toContain("Type: Rev Share");
    expect(summary).toContain("Partner Share (25%): €12,500");
    expect(summary).toContain("Our Margin: €37,500");
  });

  it("shows no introducer commission when agent is disabled", () => {
    const input = buildBaseInput({
      introducerEnabled: false,
      introducerCommissionType: "custom"
    });

    const summary = buildOfferSummaryText(input);

    expect(summary).toContain("Agent / Introducer: No");
    expect(summary).toContain("Introducer Commission: Not applied");
    expect(summary).not.toContain("Type: Custom (Progressive)");
  });
});
