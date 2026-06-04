import { describe, it, expect } from "vitest";
import { isDocumentTemplatePayload } from "./isDocumentTemplatePayload.js";
import { buildDocumentTemplatePayloadManualDefaults } from "./manualSeeds.js";
import { isCalculatorSnapshotPayload } from "../calculator/snapshotShape.js";

// The "use as template" bug: a templated document is stored as a
// calculator-config payload, but it is a DocumentTemplatePayload — NOT a
// CalculatorSnapshotPayload. These guards must be mutually exclusive so
// the wizard routes each shape to the right hydration path.
describe("isDocumentTemplatePayload", () => {
  it("accepts a real wizard document payload and rejects it as a calc snapshot", () => {
    const doc = buildDocumentTemplatePayloadManualDefaults();
    expect(isDocumentTemplatePayload(doc)).toBe(true);
    // The whole point of the fix: a document must NOT pass the snapshot
    // guard (that mismatch is why hydration silently dropped templates).
    expect(isCalculatorSnapshotPayload(doc)).toBe(false);
  });

  it("accepts a document payload missing `toggles` (migration safety)", () => {
    // Older stored documents predate `toggles`, so the guard must NOT
    // require it — and it adds no discriminating power vs a snapshot anyway
    // (the header/layout/payinPricing/contractSummary keys already do).
    const doc = buildDocumentTemplatePayloadManualDefaults() as unknown as Record<
      string,
      unknown
    >;
    delete doc.toggles;
    expect(isDocumentTemplatePayload(doc)).toBe(true);
  });

  it("rejects a calculator snapshot payload (and the snapshot guard accepts it)", () => {
    const snapshot = {
      schemaVersion: 1,
      calculatorType: { payin: true, payout: true },
      payinEuPricing: {},
      payinWwPricing: {},
      payoutPricing: {}
    };
    expect(isCalculatorSnapshotPayload(snapshot)).toBe(true);
    expect(isDocumentTemplatePayload(snapshot)).toBe(false);
  });

  it("rejects null, empty, and partial objects", () => {
    expect(isDocumentTemplatePayload(null)).toBe(false);
    expect(isDocumentTemplatePayload(undefined)).toBe(false);
    expect(isDocumentTemplatePayload({})).toBe(false);
    expect(isDocumentTemplatePayload({ header: {}, layout: {} })).toBe(false);
  });
});
