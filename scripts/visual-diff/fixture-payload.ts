/**
 * Canonical DocumentTemplatePayload for visual-diff testing.
 *
 * Uses the wizard's `buildDocumentTemplatePayloadManualDefaults()`
 * factory — the same code path operators land on when they pick
 * "Manual entry (with default values)" in the wizard source picker.
 * That factory is fully deterministic (no Date.now, no Math.random
 * leaks into the body) so the same fixture → the same HTML byte-for-
 * byte across runs, which is the foundation of any pixel-diff.
 *
 * Two flavours are exported:
 *   - `offerOnlyFixture()`      — documentScope = "offer"
 *   - `offerAndAgreementFixture()` — documentScope = "offerAndAgreement"
 *     + populated agreementParties so the MSA appendix renders.
 *
 * Header timestamps are forced to a fixed ISO date and a fixed
 * BSG-XXXXXXX number to prevent visual drift from "rendered at
 * different times".
 */

// Import directly from the deep modules (NOT the barrel
// `document-wizard/index.ts`) so the server-side typecheck doesn't
// transitively pull in React `.tsx` files — the barrel re-exports
// the wizard's React components, which would fail under
// tsconfig.server.json (no `--jsx`).
import { buildDocumentTemplatePayloadManualDefaults } from "../../src/components/document-wizard/fromCalculator";
import type { DocumentTemplatePayload } from "../../src/components/document-wizard/types";

const FIXED_DOCUMENT_DATE = "2026-05-17";
const FIXED_DOCUMENT_NUMBER_OFFER = "BSG-7100000-FIXTURE";
const FIXED_DOCUMENT_NUMBER_BUNDLE = "BSG-7100001-FIXTURE";

/** Offer-only document — every pricing section rendered, no MSA appendix. */
export function offerOnlyFixture(): DocumentTemplatePayload {
  const draft = buildDocumentTemplatePayloadManualDefaults();
  draft.documentScope = "offer";
  draft.header.documentNumber = FIXED_DOCUMENT_NUMBER_OFFER;
  draft.header.documentDateIso = FIXED_DOCUMENT_DATE;
  return draft;
}

/**
 * Bundle document — offer + Service Agreement appendix. Agreement
 * parties are filled in so the appendix shows realistic content
 * instead of the bracketed-placeholder fallback.
 */
export function offerAndAgreementFixture(): DocumentTemplatePayload {
  const draft = buildDocumentTemplatePayloadManualDefaults();
  draft.documentScope = "offerAndAgreement";
  draft.header.documentNumber = FIXED_DOCUMENT_NUMBER_BUNDLE;
  draft.header.documentDateIso = FIXED_DOCUMENT_DATE;
  draft.agreementParties = {
    ...draft.agreementParties,
    merchantLegalName: "Acme Payments Ltd",
    merchantJurisdiction: "England and Wales",
    merchantRegisteredAddress: "12 Sample Street, London EC1A 1BB, UK"
  };
  return draft;
}

export const FIXTURES = {
  offer: { name: "offer-only", build: offerOnlyFixture },
  bundle: { name: "offer-and-agreement", build: offerAndAgreementFixture }
} as const;

export type FixtureKey = keyof typeof FIXTURES;
