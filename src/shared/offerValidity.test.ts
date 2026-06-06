import { describe, expect, it } from "vitest";
import {
  OFFER_VALID_DAYS_DEFAULT,
  addDaysToIso,
  formatIsoDdMmYyyy,
  hasExplicitOfferValidity,
  isOfferExpired,
  offerValidTillIso,
  readOfferValidityHeader,
  resolveOfferValidDays
} from "./offerValidity.js";

describe("offerValidity", () => {
  describe("addDaysToIso", () => {
    it("adds days within a month", () => {
      expect(addDaysToIso("2026-06-02", 7)).toBe("2026-06-09");
    });
    it("rolls over month and year boundaries", () => {
      expect(addDaysToIso("2026-06-28", 5)).toBe("2026-07-03");
      expect(addDaysToIso("2026-12-25", 10)).toBe("2027-01-04");
    });
    it("handles leap-year February", () => {
      expect(addDaysToIso("2028-02-28", 1)).toBe("2028-02-29"); // 2028 is a leap year
      expect(addDaysToIso("2026-02-28", 1)).toBe("2026-03-01"); // 2026 is not
    });
    it("returns the input unchanged for a malformed ISO date", () => {
      expect(addDaysToIso("not-a-date", 5)).toBe("not-a-date");
    });
  });

  describe("resolveOfferValidDays (back-compat)", () => {
    it("defaults missing or invalid values to the default", () => {
      expect(resolveOfferValidDays(undefined)).toBe(OFFER_VALID_DAYS_DEFAULT);
      expect(resolveOfferValidDays(null)).toBe(OFFER_VALID_DAYS_DEFAULT);
      expect(resolveOfferValidDays(0)).toBe(OFFER_VALID_DAYS_DEFAULT);
      expect(resolveOfferValidDays(0.5)).toBe(OFFER_VALID_DAYS_DEFAULT); // fractional < 1
      expect(resolveOfferValidDays(-5)).toBe(OFFER_VALID_DAYS_DEFAULT);
      expect(resolveOfferValidDays("15")).toBe(OFFER_VALID_DAYS_DEFAULT);
      expect(resolveOfferValidDays(Number.NaN)).toBe(OFFER_VALID_DAYS_DEFAULT);
    });
    it("keeps a valid positive number (floored)", () => {
      expect(resolveOfferValidDays(7)).toBe(7);
      expect(resolveOfferValidDays(30)).toBe(30);
      expect(resolveOfferValidDays(20.9)).toBe(20);
    });
  });

  describe("hasExplicitOfferValidity (badge / PDF-line gate)", () => {
    it("is true only for a finite number >= 1", () => {
      expect(hasExplicitOfferValidity(15)).toBe(true);
      expect(hasExplicitOfferValidity(1)).toBe(true);
    });
    it("is false for missing / old / invalid values", () => {
      expect(hasExplicitOfferValidity(undefined)).toBe(false);
      expect(hasExplicitOfferValidity(null)).toBe(false);
      expect(hasExplicitOfferValidity(0)).toBe(false);
      expect(hasExplicitOfferValidity(0.5)).toBe(false);
      expect(hasExplicitOfferValidity(-3)).toBe(false);
      expect(hasExplicitOfferValidity("15")).toBe(false);
      expect(hasExplicitOfferValidity(Number.NaN)).toBe(false);
    });
  });

  describe("offerValidTillIso", () => {
    it("derives the date from document date + days", () => {
      expect(offerValidTillIso("2026-06-02", 7)).toBe("2026-06-09");
    });
    it("uses the default day count when missing", () => {
      expect(offerValidTillIso("2026-06-02", undefined)).toBe("2026-06-17"); // +15
    });
  });

  describe("isOfferExpired (boundary)", () => {
    it("stays valid through the end of the valid-till day", () => {
      // doc 2026-06-02 + 7 -> valid till 2026-06-09
      expect(isOfferExpired("2026-06-02", 7, "2026-06-08")).toBe(false);
      expect(isOfferExpired("2026-06-02", 7, "2026-06-09")).toBe(false); // same day, still valid
    });
    it("is expired once today is past the valid-till day", () => {
      expect(isOfferExpired("2026-06-02", 7, "2026-06-10")).toBe(true);
    });
  });

  describe("formatIsoDdMmYyyy", () => {
    it("formats ISO to DD.MM.YYYY", () => {
      expect(formatIsoDdMmYyyy("2026-06-09")).toBe("09.06.2026");
    });
    it("returns the input for a malformed value", () => {
      expect(formatIsoDdMmYyyy("nope")).toBe("nope");
    });
  });

  describe("readOfferValidityHeader", () => {
    it("extracts the validity fields from a payload", () => {
      const payload = { header: { documentDateIso: "2026-06-02", offerValidDays: 7 } };
      expect(readOfferValidityHeader(payload)).toEqual({
        documentDateIso: "2026-06-02",
        offerValidDays: 7
      });
    });
    it("returns null for non-object, missing header, or missing date", () => {
      expect(readOfferValidityHeader(null)).toBeNull();
      expect(readOfferValidityHeader("x")).toBeNull();
      expect(readOfferValidityHeader({})).toBeNull();
      expect(readOfferValidityHeader({ header: {} })).toBeNull();
      expect(readOfferValidityHeader({ header: { documentDateIso: 5 } })).toBeNull();
    });
    it("passes a missing offerValidDays through (resolved at use)", () => {
      const result = readOfferValidityHeader({ header: { documentDateIso: "2026-06-02" } });
      expect(result?.documentDateIso).toBe("2026-06-02");
      expect(result?.offerValidDays).toBeUndefined();
    });
  });
});
