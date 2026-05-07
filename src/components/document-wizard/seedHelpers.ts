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

export function clonePayinRegionPricing(
  pricing: PayinRegionPricingConfig
): DocumentTemplatePayload["payinPricing"]["eu"] {
  return {
    ...pricing,
    // N/A toggles default off — the calculator only emits numeric
    // values; the wizard exposes the toggles for the user to flip.
    single: { ...pricing.single, trxCcNa: false, trxApmNa: false },
    tiers: pricing.tiers.map(tier => ({ ...tier, trxCcNa: false, trxApmNa: false }))
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
