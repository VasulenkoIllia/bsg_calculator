import { describe, expect, it } from "vitest";
import { derivePayinTraffic, derivePayoutTraffic } from "./traffic.js";

describe("zone1/traffic", () => {
  it("derives payin traffic using the document example logic", () => {
    const result = derivePayinTraffic({
      monthlyVolume: 15_000_000,
      successfulTransactions: 21_000,
      approvalRatioPercent: 80,
      euPercent: 50,
      ccPercent: 70
    });

    expect(result.normalized.monthlyVolume).toBe(15_000_000);
    expect(result.averageTransaction).toBeCloseTo(714.2857, 4);

    expect(result.volume.eu).toBe(7_500_000);
    expect(result.volume.ww).toBe(7_500_000);
    expect(result.volume.cc).toBe(10_500_000);
    expect(result.volume.apm).toBe(4_500_000);

    expect(result.successful.eu).toBe(10_500);
    expect(result.successful.ww).toBe(10_500);
    expect(result.successful.cc).toBe(14_700);
    expect(result.successful.apm).toBe(6_300);

    expect(result.attempts.total).toBe(26_250);
    expect(result.failed.total).toBe(5_250);
    expect(result.failed.cc).toBe(3_675);
    expect(result.failed.apm).toBe(1_575);
  });

  it("rounds payin volume up to nearest €50,000", () => {
    const result = derivePayinTraffic({
      monthlyVolume: 172_340,
      successfulTransactions: 500,
      approvalRatioPercent: 80,
      euPercent: 50,
      ccPercent: 70
    });

    expect(result.normalized.monthlyVolume).toBe(200_000);
  });

  it("derives payout average transaction and applies volume round-up", () => {
    const result = derivePayoutTraffic({
      monthlyVolume: 172_340,
      totalTransactions: 5_000
    });

    expect(result.normalized.monthlyVolume).toBe(200_000);
    expect(result.averageTransaction).toBe(40);
  });
});
