/**
 * Unit tests for the BSG-XXXXXXX-YYYYYY formatter.
 *
 * `formatNumber` is exported separately from the DB-touching peek /
 * allocate functions specifically so these edge cases can be tested
 * without a database round-trip.
 */

import { describe, expect, it } from "vitest";
import { formatNumber } from "./numbering.service";
import { InternalError } from "../../shared/errors";

describe("formatNumber", () => {
  it("renders BSG-<7d>-<last6 of hubspotCompanyId> for a 12-digit id", () => {
    expect(formatNumber(7100001, "426487875793")).toBe("BSG-7100001-875793");
  });

  it("zero-pads sequence to 7 digits", () => {
    expect(formatNumber(42, "111111111111")).toBe("BSG-0000042-111111");
  });

  it("renders XXXXXX placeholder when hubspotCompanyId is undefined", () => {
    expect(formatNumber(7100001)).toBe("BSG-7100001-XXXXXX");
  });

  it("renders XXXXXX placeholder when hubspotCompanyId is empty string", () => {
    expect(formatNumber(7100001, "")).toBe("BSG-7100001-XXXXXX");
  });

  it("left-pads short ids with zeros to reach 6 chars", () => {
    expect(formatNumber(7100001, "abc")).toBe("BSG-7100001-000abc");
  });

  it("verbatim-passes 6-char ids", () => {
    expect(formatNumber(7100001, "874808")).toBe("BSG-7100001-874808");
  });

  it("uses ONLY the last 6 chars when the id is longer than 6", () => {
    expect(formatNumber(7100001, "ABCDEFGHIJKL")).toBe("BSG-7100001-GHIJKL");
  });

  it("throws InternalError for non-integer sequence values", () => {
    expect(() => formatNumber(0)).toThrow(InternalError);
    expect(() => formatNumber(-1)).toThrow(InternalError);
    expect(() => formatNumber(1.5)).toThrow(InternalError);
  });
});
