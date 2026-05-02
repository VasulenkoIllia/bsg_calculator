import { describe, expect, it } from "vitest";
import { parseInputNumber } from "./numberUtils.js";

describe("parseInputNumber", () => {
  it("supports comma and dot as decimal separators", () => {
    expect(parseInputNumber("0,2")).toBe(0.2);
    expect(parseInputNumber("0.2")).toBe(0.2);
    expect(parseInputNumber("1,25")).toBe(1.25);
    expect(parseInputNumber("1.25")).toBe(1.25);
  });

  it("supports thousand separators for comma-only and dot-only formats", () => {
    expect(parseInputNumber("1,000")).toBe(1000);
    expect(parseInputNumber("10,000")).toBe(10000);
    expect(parseInputNumber("1.000")).toBe(1000);
    expect(parseInputNumber("10.000")).toBe(10000);
    expect(parseInputNumber("1.000.000")).toBe(1000000);
  });

  it("supports mixed locale grouped formats", () => {
    expect(parseInputNumber("1,234.56")).toBe(1234.56);
    expect(parseInputNumber("1.234,56")).toBe(1234.56);
  });

  it("returns NaN for non-numeric placeholders", () => {
    expect(Number.isNaN(parseInputNumber(""))).toBe(true);
    expect(Number.isNaN(parseInputNumber("-"))).toBe(true);
    expect(Number.isNaN(parseInputNumber("."))).toBe(true);
  });
});
