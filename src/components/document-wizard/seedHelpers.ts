import type {
  PayinRegionPricingConfig,
  PayoutPricingConfig,
  PricingModelType
} from "../../domain/calculator/index.js";
import {
  DEFAULT_DOCUMENT_SCOPE,
  DOCUMENT_TYPE_LABELS
} from "./legalDefaults.js";
import type { DocumentHeaderMetaDraft, DocumentTemplatePayload, PayinCustomRow } from "./types.js";
import { PAYIN_TRX_APM_MIN, PAYIN_TRX_CC_MIN } from "./wizardDefaults.js";
import { OFFER_VALID_DAYS_DEFAULT } from "../../shared/offerValidity.js";

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
    offerValidDays: OFFER_VALID_DAYS_DEFAULT,
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

// Override a cloned payin region's TRX fees to the provider-cost floor
// defaults (C/D, APM) on the single block + all three tiers, preserving
// MDR + N/A flags. Lets the manual "defaults" seed start a fresh
// document at provider cost while the frozen calculator config (0.35)
// stays untouched.
export function applyPayinTrxFloorDefaults(
  region: DocumentTemplatePayload["payinPricing"]["eu"]
): DocumentTemplatePayload["payinPricing"]["eu"] {
  const floor = <T extends { trxCc: number; trxApm: number }>(block: T): T => ({
    ...block,
    trxCc: PAYIN_TRX_CC_MIN,
    trxApm: PAYIN_TRX_APM_MIN
  });
  return {
    ...region,
    single: floor(region.single),
    tiers: [
      floor(region.tiers[0]),
      floor(region.tiers[1]),
      floor(region.tiers[2])
    ] as DocumentTemplatePayload["payinPricing"]["eu"]["tiers"]
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

// Generate a stable ID for new custom Payin rows. Uses crypto.randomUUID
// when available (modern browsers + Node 19+); falls back to a
// timestamp + random suffix for older environments. IDs only need to be
// unique within a single draft — never sent to HubSpot, never stored
// long-term beyond `documents.payload`.
function generateCustomRowId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `row_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// Factory for a new PayinCustomRow with sensible defaults — applied
// when the operator clicks "+ Add custom row" in the wizard. Matches
// the wizard EU defaults (icpp / single / EUR / TRX enabled) so the
// UI fields render in a familiar starting state.
export function makeDefaultPayinCustomRow(): PayinCustomRow {
  // TRX fees start at provider cost (C/D, APM); MDR stays 0 for the
  // operator to fill. The wizard min props block going below cost.
  const defaultFeeBlock = {
    mdrPercent: 0,
    trxCc: PAYIN_TRX_CC_MIN,
    trxCcNa: false,
    trxApm: PAYIN_TRX_APM_MIN,
    trxApmNa: false
  };
  return {
    id: generateCustomRowId(),
    region: "New region",
    currency: "EUR",
    model: "icpp",
    rateMode: "single",
    trxFeeEnabled: true,
    tier1UpToMillion: 5,
    tier2UpToMillion: 10,
    single: { ...defaultFeeBlock },
    tiers: [
      { ...defaultFeeBlock },
      { ...defaultFeeBlock },
      { ...defaultFeeBlock }
    ],
    minTrxFeeThresholdMillion: 0,
    minTrxFeePerTransaction: 0,
    minTrxFeeRowNa: false
  };
}

// Deep clone a PayinCustomRow. Used by `fromCalculator.ts` /
// `manualSeeds.ts` whenever a draft is hydrated from a persisted
// payload so the live wizard state never aliases the source.
export function clonePayinCustomRow(row: PayinCustomRow): PayinCustomRow {
  return {
    ...row,
    single: { ...row.single },
    tiers: [
      { ...row.tiers[0] },
      { ...row.tiers[1] },
      { ...row.tiers[2] }
    ]
  };
}
