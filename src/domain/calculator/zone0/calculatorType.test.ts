import { describe, expect, it } from "vitest";
import { applyCalculatorModeToggle, normalizeCalculatorType } from "./calculatorType.js";

describe("zone0/calculatorType", () => {
  it("keeps explicit selection when at least one mode is enabled", () => {
    expect(normalizeCalculatorType({ payin: true, payout: true })).toEqual({
      payin: true,
      payout: true
    });
  });

  it("defaults to payin when both modes are disabled", () => {
    expect(normalizeCalculatorType({ payin: false, payout: false })).toEqual({
      payin: true,
      payout: false
    });
  });

  it("moves to payout when payin is disabled as the only active mode", () => {
    expect(
      applyCalculatorModeToggle({ payin: true, payout: false }, "payin", false)
    ).toEqual({
      payin: false,
      payout: true
    });
  });

  it("moves to payin when payout is disabled as the only active mode", () => {
    expect(
      applyCalculatorModeToggle({ payin: false, payout: true }, "payout", false)
    ).toEqual({
      payin: true,
      payout: false
    });
  });
});
