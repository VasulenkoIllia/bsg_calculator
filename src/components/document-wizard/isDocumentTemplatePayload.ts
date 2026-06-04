import type { DocumentTemplatePayload } from "./types.js";

// Runtime guard: is this JSONB blob a wizard `DocumentTemplatePayload`
// (as opposed to a calculator `CalculatorSnapshotPayload`)?
//
// Used when the wizard hydrates a linked calculator-config (`?calc=<id>`).
// A config created by "Use as template" carries a DOCUMENT payload —
// already a complete wizard draft — while a saved-calculator config
// carries a `CalculatorSnapshotPayload`. The two shapes are distinct:
//   - snapshot has top-level `payinEuPricing` / `payinWwPricing`,
//     `payinVolume`, … and NO `layout` / `header` / `documentScope`.
//   - document has `header` / `layout` / `payinPricing` (nested
//     eu/ww/customRows) / `contractSummary` / `documentScope`.
//
// Shallow guard — checks the document-only top-level keys a calculator
// snapshot never has. We intentionally do NOT require `toggles`: older
// stored documents may predate it, and it adds zero discriminating power
// (a calculator snapshot has neither `toggles` nor the keys checked here).
// Anything deeper is validated by the server's `isWizardPayload` before a
// document is ever persisted.
export function isDocumentTemplatePayload(
  value: unknown
): value is DocumentTemplatePayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.documentScope === "string" &&
    !!v.header &&
    typeof v.header === "object" &&
    !!v.layout &&
    typeof v.layout === "object" &&
    !!v.payinPricing &&
    typeof v.payinPricing === "object" &&
    !!v.contractSummary &&
    typeof v.contractSummary === "object"
  );
}
