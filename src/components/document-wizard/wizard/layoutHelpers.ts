// Pure layout/step helpers for the document wizard.
//
// Extracted from `shared.tsx` so a Node-side caller (backend Zod
// validators, payload reshaping scripts, future server-render of the
// wizard preview) can import these without dragging React in.
//
// IMPORTANT: no React imports. The matching React components live in
// `shared.tsx`, which re-exports everything from this module so existing
// call sites keep working with a single import surface.

import type { DocumentScope } from "../legalDefaults.js";
import type {
  DocumentTemplatePayload,
  PayinRegionMode,
  WizardStep
} from "../types.js";

interface StepDef {
  value: WizardStep;
  label: string;
}

const ALL_STEPS: StepDef[] = [
  { value: 1, label: "Header" },
  { value: 2, label: "Payin" },
  { value: 3, label: "Payout" },
  { value: 4, label: "Fees" },
  { value: 5, label: "Terms" },
  { value: 7, label: "Parties" },
  { value: 6, label: "Preview" }
];

const PRICING_STEP_VALUES: ReadonlyArray<WizardStep> = [2, 3, 4, 5];

export function isPricingStep(step: WizardStep): boolean {
  return PRICING_STEP_VALUES.includes(step);
}

export function isPartiesStep(step: WizardStep): boolean {
  return step === 7;
}

export function isPreviewStep(step: WizardStep): boolean {
  return step === 6;
}

export function getVisibleSteps(scope: DocumentScope): StepDef[] {
  if (scope === "offer") {
    // Offer-only flow: no Parties & Signatures step.
    return ALL_STEPS.filter(step => !isPartiesStep(step.value));
  }
  // offerAndAgreement — all steps including Parties & Signatures.
  return [...ALL_STEPS];
}

export function nextStep(scope: DocumentScope, current: WizardStep): WizardStep {
  const visible = getVisibleSteps(scope);
  const index = visible.findIndex(step => step.value === current);
  if (index < 0 || index >= visible.length - 1) return current;
  return visible[index + 1].value;
}

export function previousStep(scope: DocumentScope, current: WizardStep): WizardStep {
  const visible = getVisibleSteps(scope);
  const index = visible.findIndex(step => step.value === current);
  if (index <= 0) return current;
  return visible[index - 1].value;
}

export function clampStepToScope(scope: DocumentScope, current: WizardStep): WizardStep {
  const visible = getVisibleSteps(scope);
  if (visible.some(step => step.value === current)) return current;
  return visible[0]?.value ?? 1;
}

export function getStepLabel(step: WizardStep): string {
  return ALL_STEPS.find(entry => entry.value === step)?.label ?? `Step ${step}`;
}

export type PayinRegionKey = "eu" | "ww";

export const PAYIN_REGION_LABELS: Record<PayinRegionKey, string> = {
  eu: "EEA + UK",
  ww: "Global"
};

export function resolvePayinTableMode(
  regionMode: PayinRegionMode,
  euRateMode: "single" | "tiered",
  wwRateMode: "single" | "tiered"
): DocumentTemplatePayload["layout"]["payin"]["tableMode"] {
  if (regionMode === "none") {
    return euRateMode === "tiered" || wwRateMode === "tiered" ? "flatTiered" : "flatSingle";
  }

  const activeModes: Array<"single" | "tiered"> = [];
  if (regionMode === "both" || regionMode === "euOnly") activeModes.push(euRateMode);
  if (regionMode === "both" || regionMode === "wwOnly") activeModes.push(wwRateMode);

  const tiered = activeModes.some(mode => mode === "tiered");
  return tiered ? "byRegionTiered" : "byRegionFlat";
}

export function resolveEnabledPayinRegionMode(
  current: PayinRegionMode,
  euPercent: number,
  wwPercent: number
): PayinRegionMode {
  if (current !== "none") return current;

  const euEnabled = euPercent > 0;
  const wwEnabled = wwPercent > 0;
  if (euEnabled && wwEnabled) return "both";
  if (euEnabled) return "euOnly";
  if (wwEnabled) return "wwOnly";
  return "both";
}

export function parseNullableNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const normalized = trimmed.replace(/,/g, ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}
