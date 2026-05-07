import { NumberField } from "../../calculator/index.js";
import type { DocumentScope } from "../legalDefaults.js";
import type { DocumentTemplatePayload, PayinRegionMode, WizardStep } from "../types.js";

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

export const SETTLEMENT_PERIOD_OPTIONS = ["T+1", "T+2", "T+3", "T+4", "T+5"] as const;

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

export function Stepper({
  activeStep,
  scope,
  onStepChange
}: {
  activeStep: WizardStep;
  scope: DocumentScope;
  onStepChange: (step: WizardStep) => void;
}) {
  const visibleSteps = getVisibleSteps(scope);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Wizard Steps
      </p>
      <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-1">
        {visibleSteps.map((step, index) => {
          const isActive = step.value === activeStep;
          const isLast = index === visibleSteps.length - 1;
          const displayIndex = index + 1;
          return (
            <div key={`wizard-step-${step.value}`} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onStepChange(step.value)}
                className={[
                  "h-11 w-11 shrink-0 rounded-full border text-sm font-bold transition",
                  isActive
                    ? "border-blue-500 bg-blue-50 text-blue-700 shadow-[0_0_0_3px_rgba(59,130,246,0.15)]"
                    : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                ].join(" ")}
                aria-label={`Go to step ${step.label}`}
                aria-pressed={isActive}
              >
                {displayIndex}
              </button>
              <div className="shrink-0">
                <p className="whitespace-nowrap text-xs font-semibold text-slate-700">
                  {step.label}
                </p>
              </div>
              {!isLast ? <div className="h-px w-6 shrink-0 bg-slate-300" /> : null}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        Selected document type drives which steps are shown. The Parties &amp; Signatures step
        appears only when generating Offer + Terms of Agreement.
      </p>
    </div>
  );
}

// Fee input paired with an "N/A" checkbox. When the checkbox is on,
// the numeric field is disabled and the corresponding cell in the PDF
// renders the literal "N/A" instead of the value (handled by the
// renderer based on the boolean flag).
//
// Three states the wizard payload can express via the (value, na)
// pair, mirroring the OFFER PDF rendering rules:
//   - na = false, value > 0 → display value
//   - na = false, value = 0 (or empty) → block hidden by global
//     hide-if-empty rule
//   - na = true → display "N/A"
export function FeeFieldWithNa({
  label,
  value,
  na,
  onValueChange,
  onNaChange,
  min,
  max,
  step,
  ariaPrefix
}: {
  label: string;
  value: number;
  na: boolean;
  onValueChange: (next: number) => void;
  onNaChange: (next: boolean) => void;
  min?: number;
  max?: number;
  step?: number;
  ariaPrefix?: string;
}) {
  const checkboxId = `${ariaPrefix ?? label.replace(/\W+/g, "-")}-na`;
  return (
    <div className="space-y-1">
      <NumberField
        label={label}
        value={na ? 0 : value}
        onChange={onValueChange}
        min={min}
        max={max}
        step={step}
        readOnly={na}
        helper={na ? "Locked — cell renders as N/A" : undefined}
      />
      <label
        htmlFor={checkboxId}
        className="inline-flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-600"
      >
        <input
          id={checkboxId}
          type="checkbox"
          className="h-3.5 w-3.5 accent-blue-600"
          checked={na}
          onChange={event => onNaChange(event.target.checked)}
        />
        Show as N/A
      </label>
    </div>
  );
}

export function StepNavigation({
  onBack,
  onNext,
  backLabel,
  nextLabel
}: {
  onBack?: () => void;
  onNext?: () => void;
  backLabel?: string;
  nextLabel?: string;
}) {
  if (!onBack && !onNext) return null;

  return (
    <div className="mt-5 flex flex-wrap gap-3">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          {backLabel ?? "Back"}
        </button>
      ) : null}
      {onNext ? (
        <button
          type="button"
          onClick={onNext}
          className="rounded-xl border border-blue-300 bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
        >
          {nextLabel ?? "Next"}
        </button>
      ) : null}
    </div>
  );
}
