import { describe, expect, it } from "vitest";
import {
  DEFAULT_CUSTOM_TIER_SETTINGS,
  calculateCustomIntroducerCommission,
  calculateRevShareIntroducerCommission,
  calculateStandardIntroducerCommission
} from "./introducerCommission.js";

describe("zone2/introducerCommission", () => {
  it("exposes configured custom defaults", () => {
    expect(DEFAULT_CUSTOM_TIER_SETTINGS).toEqual({
      tier1UpToMillion: 5,
      tier2UpToMillion: 10,
      tier1RatePerMillion: 7_500,
      tier2RatePerMillion: 5_000,
      tier3RatePerMillion: 2_500
    });
  });

  it("calculates standard commission using one retrospective tier for full volume", () => {
    const result = calculateStandardIntroducerCommission(18_000_000);

    expect(result.appliedTier.label).toBe("Tier 2 (€10M-€25M)");
    expect(result.appliedTier.ratePerMillion).toBe(5_000);
    expect(result.totalCommission).toBe(90_000);
  });

  it("keeps boundary volume at tier 1 upper limit in tier 1", () => {
    const result = calculateStandardIntroducerCommission(10_000_000);

    expect(result.appliedTier.label).toBe("Tier 1 (€0-€10M)");
    expect(result.totalCommission).toBe(25_000);
  });

  it("calculates custom commission progressively by tiers", () => {
    const result = calculateCustomIntroducerCommission(
      18_000_000,
      DEFAULT_CUSTOM_TIER_SETTINGS
    );

    expect(result.tiers[0].volumeMillionInTier).toBe(5);
    expect(result.tiers[0].commission).toBe(37_500);
    expect(result.tiers[1].volumeMillionInTier).toBe(5);
    expect(result.tiers[1].commission).toBe(25_000);
    expect(result.tiers[2].volumeMillionInTier).toBe(8);
    expect(result.tiers[2].commission).toBe(20_000);
    expect(result.totalCommission).toBe(82_500);
  });

  it("calculates custom tier 3 for volume above tier 2 boundary", () => {
    const result = calculateCustomIntroducerCommission(30_000_000);

    expect(result.tiers[0].commission).toBe(37_500);
    expect(result.tiers[1].commission).toBe(25_000);
    expect(result.tiers[2].commission).toBe(50_000);
    expect(result.totalCommission).toBe(112_500);
  });

  it("calculates rev-share commission from margin", () => {
    const result = calculateRevShareIntroducerCommission({
      totalRevenue: 150_000,
      totalCosts: 100_000,
      sharePercent: 25
    });

    expect(result.marginBeforeSplit).toBe(50_000);
    expect(result.partnerShare).toBe(12_500);
    expect(result.ourMargin).toBe(37_500);
  });

  it("clamps rev-share percent to 50%", () => {
    const result = calculateRevShareIntroducerCommission({
      totalRevenue: 100_000,
      totalCosts: 0,
      sharePercent: 80
    });

    expect(result.sharePercent).toBe(50);
    expect(result.partnerShare).toBe(50_000);
    expect(result.ourMargin).toBe(50_000);
  });
});
