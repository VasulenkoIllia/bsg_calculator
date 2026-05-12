import { describe, expect, it } from "vitest";
import { calculatePayinProfitability } from "../../../domain/calculator/zone5/profitability.js";
import { DEFAULT_PAYIN_EU_PRICING_CONFIG, DEFAULT_PAYIN_WW_PRICING_CONFIG } from "../../../domain/calculator/zone3/pricingConfiguration.js";
import type { PayinRegionPricingConfig, PayinRegionPricingPreview } from "../../../domain/calculator/zone3/pricingConfiguration.js";
import type { PayinTrafficDerived } from "../../../domain/calculator/zone1/traffic.js";
import { buildPayinSubtree } from "./buildPayinSubtree.js";

// Minimal fixtures shared across cases. Only the fields the subtree
// actually reads are populated; everything else is harmless zeros.
function makePayinTraffic(): PayinTrafficDerived {
  return {
    volume: { total: 1_000_000, eu: 800_000, ww: 200_000, byRegionMethod: { euCc: 560_000, euApm: 240_000, wwCc: 140_000, wwApm: 60_000 } },
    averageTransaction: 100,
    attempts: { total: 12_500, byRegionMethod: { euCc: 7_000, euApm: 3_000, wwCc: 1_750, wwApm: 750 } },
    successful: { total: 10_000, byRegionMethod: { euCc: 5_600, euApm: 2_400, wwCc: 1_400, wwApm: 600 } },
    failed: { total: 2_500, byRegionMethod: { euCc: 1_400, euApm: 600, wwCc: 350, wwApm: 150 } }
  } as unknown as PayinTrafficDerived;
}

function makePreview(): PayinRegionPricingPreview {
  return {
    mdrRevenue: 0,
    trxRevenue: 0,
    totalRevenue: 0,
    schemeCostImpact: 0,
    revenueAfterSchemePreview: 0,
    tierRows: [],
    warnings: []
  };
}

function findSchemeFeesEu(node: ReturnType<typeof buildPayinSubtree>): { formula?: string; value: number } | null {
  if (!node) return null;
  const stack = [node];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    if (current.id === "unified-payin-eu-scheme-fees") {
      return { formula: current.formula, value: current.value };
    }
    if (current.children) stack.push(...current.children);
  }
  return null;
}

function runSubtree(euPricing: PayinRegionPricingConfig) {
  const payin = makePayinTraffic();
  const wwPricing = DEFAULT_PAYIN_WW_PRICING_CONFIG;
  const payinProfitability = calculatePayinProfitability({
    eu: {
      volume: 800_000,
      mdrRevenue: 0,
      trxRevenue: 0,
      failedTrxRevenue: 0,
      attemptsCcTransactions: 0,
      attemptsApmTransactions: 0,
      pricingModel: euPricing.model,
      schemeFeesPercent: euPricing.schemeFeesPercent,
      interchangePercent: euPricing.interchangePercent,
      dedicatedCountries: euPricing.dedicatedCountries
    },
    ww: {
      volume: 200_000,
      mdrRevenue: 0,
      trxRevenue: 0,
      failedTrxRevenue: 0,
      attemptsCcTransactions: 0,
      attemptsApmTransactions: 0,
      pricingModel: wwPricing.model,
      schemeFeesPercent: wwPricing.schemeFeesPercent,
      interchangePercent: wwPricing.interchangePercent
    }
  });

  return buildPayinSubtree({
    calculatorType: { payin: true, payout: false },
    payin,
    payinEuPricing: euPricing,
    payinWwPricing: wwPricing,
    payinEuPreview: makePreview(),
    payinWwPreview: makePreview(),
    payinProfitability,
    payinProfitabilityWithThreeDs: { revenue: { total: 0 }, costs: { total: payinProfitability.costs.total }, netMargin: -payinProfitability.costs.total },
    failedTrxRevenueByRegion: { eu: 0, ww: 0 },
    threeDsPayinRegionalBreakdown: {
      eu: { revenue: 0, cost: 0, successfulTransactions: 0, attempts: 0 },
      ww: { revenue: 0, cost: 0, successfulTransactions: 0, attempts: 0 }
    },
    threeDsRevenuePerSuccessfulTransaction: 0,
    euTrxRevenueCc: 0,
    euTrxRevenueApm: 0,
    wwTrxRevenueCc: 0,
    wwTrxRevenueApm: 0
  });
}

describe("buildPayinSubtree — Scheme Fees formula display", () => {
  // Regression guard for the 2026-05-12 fix: when Dedicated Countries
  // is OFF (or share = 0) the formula stays in the original "volume ×
  // schemeFeesPercent%" form. When ON, the displayed formula shows
  // the split between standard and dedicated portions so it matches
  // the actually-computed `costs.schemeFees`.

  it("keeps the original single-line formula when dedicatedCountries is off", () => {
    const node = runSubtree({
      ...DEFAULT_PAYIN_EU_PRICING_CONFIG,
      schemeFeesPercent: 0.75,
      dedicatedCountries: { enabled: false, ukPercent: 50, chPercent: 25 }
    });
    const scheme = findSchemeFeesEu(node);
    expect(scheme).not.toBeNull();
    // 800,000 × 0.75% = 6,000 — no split shown because feature is off.
    // formatAmount2 strips trailing zeros for whole-number amounts.
    expect(scheme?.formula).toBe("€800,000 × 0.75% = €6,000");
    expect(scheme?.value).toBeCloseTo(-6_000, 6);
  });

  it("keeps the original formula when share is 0 (UK% + CH% both zero)", () => {
    const node = runSubtree({
      ...DEFAULT_PAYIN_EU_PRICING_CONFIG,
      schemeFeesPercent: 0.75,
      dedicatedCountries: { enabled: true, ukPercent: 0, chPercent: 0 }
    });
    const scheme = findSchemeFeesEu(node);
    expect(scheme?.formula).toBe("€800,000 × 0.75% = €6,000");
  });

  it("renders the split formula when Dedicated Countries is enabled with a non-zero share", () => {
    // UK + CH = 30% → 70% standard at 0.75%, 30% dedicated at 1.30%
    //   = 800,000 × 0.7 × 0.0075 + 800,000 × 0.3 × 0.013
    //   = 4,200 + 3,120 = 7,320
    const node = runSubtree({
      ...DEFAULT_PAYIN_EU_PRICING_CONFIG,
      schemeFeesPercent: 0.75,
      dedicatedCountries: { enabled: true, ukPercent: 10, chPercent: 20 }
    });
    const scheme = findSchemeFeesEu(node);
    expect(scheme).not.toBeNull();
    // Display includes both portions and the fixed 1.30% coefficient.
    expect(scheme?.formula).toContain("Standard €560,000 × 0.75%");
    expect(scheme?.formula).toContain("Dedicated UK+CH €240,000 × 1.3%");
    // formatAmount2 emits "€7,320" (no trailing zeros for whole numbers).
    expect(scheme?.formula).toContain("= €7,320");
    expect(scheme?.value).toBeCloseTo(-7_320, 6);
  });
});
