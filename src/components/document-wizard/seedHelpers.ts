import type {
  PayinRegionPricingConfig,
  PayoutPricingConfig,
  PricingModelType
} from "../../domain/calculator/index.js";
import {
  DEFAULT_DOCUMENT_SCOPE,
  DOCUMENT_TYPE_LABELS
} from "./legalDefaults.js";
import type { DocumentHeaderMetaDraft, DocumentTemplatePayload } from "./types.js";

export const DEFAULT_COLLECTION_FREQUENCY = "Daily (unless agreed otherwise)";

export function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// FN.1 placeholder: returns a transient draft number for UI preview.
// Real numbering follows `BSG-#####-XXXXX` semantics and will be issued by the
// Phase 8 backend numbering service. Replace at the call site once the backend
// allocator is wired in.
export function defaultDraftNumber(): string {
  const suffix = String(Date.now() % 100_000).padStart(5, "0");
  return `BSG-DRAFT-${suffix}`;
}

function toCollectionModelToken(model: PricingModelType): string {
  return model === "icpp" ? "IC++" : "Blended";
}

export function resolveCollectionModelDisplay(
  euModel: PricingModelType,
  wwModel: PricingModelType
): string {
  if (euModel === wwModel) {
    return toCollectionModelToken(euModel);
  }
  return "IC++ / Blended";
}

export function buildDocumentHeaderMetaFromCalculator(
  payinEuModel: PricingModelType,
  payinWwModel: PricingModelType
): DocumentHeaderMetaDraft {
  return {
    documentType: DOCUMENT_TYPE_LABELS[DEFAULT_DOCUMENT_SCOPE],
    documentNumber: defaultDraftNumber(),
    documentDateIso: todayIsoDate(),
    collectionModel: resolveCollectionModelDisplay(payinEuModel, payinWwModel),
    collectionFrequency: DEFAULT_COLLECTION_FREQUENCY
  };
}

// Canonical calculator-config → wizard-payload pricing converter.
// Used by:
//   - `fromCalculator.ts` (snapshot a live calculator state into a
//     wizard draft)
//   - `manualSeeds.ts` (initial defaults for a freshly-opened wizard)
// Centralising the shape transform here means a future field add
// (e.g. new N/A toggle, new tier field) updates one site.
export function clonePayinRegionPricing(
  pricing: PayinRegionPricingConfig
): DocumentTemplatePayload["payinPricing"]["eu"] {
  // `pricing.dedicatedCountries` is intentionally dropped here — the
  // Dedicated Countries feature is calculator-only and must not bleed
  // into wizard / PDF payloads. The destructure below excludes the
  // field; the spread `...rest` carries everything else. The underscore
  // prefix on the variable name signals "intentionally unused" to
  // every linter without needing a directive.
  const { dedicatedCountries: _excluded, ...rest } = pricing;
  void _excluded;
  // `.map` widens the tuple to `PayinFeeBlock[]`; we cast back to the
  // fixed 3-element tuple because the source `pricing.tiers` is
  // already a 3-element tuple (`PayinRegionPricingConfig.tiers`).
  const tiers = pricing.tiers.map(tier => ({
    ...tier,
    trxCcNa: false,
    trxApmNa: false
  })) as DocumentTemplatePayload["payinPricing"]["eu"]["tiers"];
  return {
    ...rest,
    // N/A toggles default off — the calculator only emits numeric
    // values; the wizard exposes the toggles for the user to flip.
    single: { ...pricing.single, trxCcNa: false, trxApmNa: false },
    tiers
  };
}

export function clonePayoutPricing(
  pricing: PayoutPricingConfig
): DocumentTemplatePayload["payoutPricing"] {
  return {
    ...pricing,
    single: { ...pricing.single, trxFeeNa: false },
    tiers: pricing.tiers.map(tier => ({ ...tier, trxFeeNa: false }))
  };
}
