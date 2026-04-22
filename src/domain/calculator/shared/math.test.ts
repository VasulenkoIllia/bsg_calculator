import { describe, expect, it } from "vitest";
import {
  ceilAmountForDisplay,
  roundUpToStep,
  splitIntegerByPercent
} from "./math.js";

describe("shared/math", () => {
  it("rounds up volume to nearest step", () => {
    expect(roundUpToStep(172_340, 50_000)).toBe(200_000);
    expect(roundUpToStep(200_000, 50_000)).toBe(200_000);
  });

  it("splits integer values with remainder preserved", () => {
    expect(splitIntegerByPercent(21_000, 50)).toEqual({
      primary: 10_500,
      secondary: 10_500
    });
    expect(splitIntegerByPercent(21_000, 70)).toEqual({
      primary: 14_700,
      secondary: 6_300
    });
  });

  it("ceils positive and negative values for display", () => {
    expect(ceilAmountForDisplay(100.01)).toBe(101);
    expect(ceilAmountForDisplay(-100.01)).toBe(-101);
  });
});
