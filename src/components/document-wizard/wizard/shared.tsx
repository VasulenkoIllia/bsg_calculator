import { MiniToggle, NumberField } from "../../calculator/index.js";
import type { DocumentScope } from "../legalDefaults.js";
import type {
  DocumentTemplatePayload,
  ValueMode,
  WizardStep
} from "../types.js";
import {
  getVisibleSteps,
  parseNullableNumber
} from "./layoutHelpers.js";

// ────────────────────────────────────────────────────────────────
// Pure step + layout helpers live in `layoutHelpers.ts` so they
// can be imported by Node-side tooling without dragging React in.
// We re-export them here so existing call sites with
// `from "../shared.js"` keep working untouched.
// ────────────────────────────────────────────────────────────────
export {
  isPricingStep,
  isPartiesStep,
  isPreviewStep,
  getVisibleSteps,
  nextStep,
  previousStep,
  clampStepToScope,
  getStepLabel,
  resolvePayinTableMode,
  resolveEnabledPayinRegionMode,
  parseNullableNumber,
  PAYIN_REGION_LABELS,
  type PayinRegionKey
} from "./layoutHelpers.js";

// Re-export from the domain layer (single source of truth for the
// allowed settlement values). Kept under the old name so the
// existing `TermsLegalSection` import keeps working without churn.
export { SETTLEMENT_PERIODS as SETTLEMENT_PERIOD_OPTIONS } from "../../../domain/calculator/zone4/otherFeesAndLimits.js";

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

// Tailwind utility chain applied to a `field-input` (input or textarea)
// when the wizard wants it to look read-only: gray fill, not-allowed
// cursor, suppressed focus ring. Centralised so every locked field
// looks identical.
export const LOCKED_INPUT_CLASSES =
  "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-700 focus:border-slate-200 focus:ring-0";

// Build a `field-input` className that includes the locked styling
// when `locked === true`. Saves repeating the array-join boilerplate
// in every wizard step.
export function fieldInputClass(locked: boolean): string {
  return locked ? `field-input ${LOCKED_INPUT_CLASSES}` : "field-input";
}

// Curried updater: returns a function that patches a single sub-key
// of `DocumentTemplatePayload`. Used by wizard steps to avoid the
// repeated `onDraftChange({ ...draft, [section]: { ...draft[section],
// ...patch } })` boilerplate.
export function makeSectionUpdater<K extends keyof DocumentTemplatePayload>(
  draft: DocumentTemplatePayload,
  onDraftChange: (next: DocumentTemplatePayload) => void,
  section: K
) {
  return (patch: Partial<DocumentTemplatePayload[K]>) => {
    onDraftChange({
      ...draft,
      [section]: {
        ...(draft[section] as object),
        ...(patch as object)
      } as DocumentTemplatePayload[K]
    });
  };
}

// Convenience wrapper for the most common case — patch
// `contractSummary`. Most wizard steps need exactly this updater.
export function makeContractSummaryUpdater(
  draft: DocumentTemplatePayload,
  onDraftChange: (next: DocumentTemplatePayload) => void
) {
  return makeSectionUpdater(draft, onDraftChange, "contractSummary");
}

// Convenience wrapper for `valueModes`. The map is optional so the
// updater spreads its current state (or empty object) before the
// patch.
export function makeValueModeUpdater(
  draft: DocumentTemplatePayload,
  onDraftChange: (next: DocumentTemplatePayload) => void
) {
  return (
    key: keyof NonNullable<DocumentTemplatePayload["valueModes"]>,
    mode: ValueMode
  ) => {
    onDraftChange({
      ...draft,
      valueModes: { ...(draft.valueModes ?? {}), [key]: mode }
    });
  };
}

// Lightweight checkbox-card primitive used by every wizard step that
// shows an "Enable section" or "Add note" toggle. Centralises the
// pill styling that was repeated 8+ times.
export function ToggleCheckbox({
  checked,
  onChange,
  label,
  ariaLabel,
  disabled
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
      <input
        className="h-4 w-4 accent-blue-600"
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        aria-label={ariaLabel}
        disabled={disabled}
      />
      {label}
    </label>
  );
}

// Custom "section note" card. A toggle + textarea pair used at the
// bottom of the Payin and Payout wizard steps to let the user attach
// a free-form note that renders under the corresponding pricing
// table in the OFFER PDF. The textarea is locked while the toggle is
// off so the user opts in explicitly.
export function SectionCustomNoteCard({
  title,
  description,
  enabled,
  text,
  onEnabledChange,
  onTextChange,
  ariaPrefix
}: {
  title: string;
  description: string;
  enabled: boolean;
  text: string;
  onEnabledChange: (next: boolean) => void;
  onTextChange: (next: string) => void;
  ariaPrefix: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-800">{title}</p>
          <p className="mt-1 text-xs text-slate-600">{description}</p>
        </div>
        <label className="inline-flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700">
          <input
            type="checkbox"
            className="h-3.5 w-3.5 accent-blue-600"
            checked={enabled}
            onChange={event => onEnabledChange(event.target.checked)}
            aria-label={`${ariaPrefix} enable`}
          />
          Add note
        </label>
      </div>
      <textarea
        className={[
          "field-input mt-3 min-h-[72px] resize-y",
          !enabled ? LOCKED_INPUT_CLASSES : ""
        ].join(" ")}
        value={text}
        onChange={event => onTextChange(event.target.value)}
        placeholder={
          enabled
            ? "Free text rendered in muted gray under the table. Use line breaks freely."
            : "Toggle 'Add note' to enable this textarea."
        }
        aria-label={`${ariaPrefix} text`}
        readOnly={!enabled}
        aria-readonly={!enabled}
      />
    </div>
  );
}

// Numeric field paired with a Number / N/A / TBD picker. Used for
// optional contract values whose underlying type is "number | null"
// (e.g. transaction limits, rolling reserve cap). The picker drives
// `valueModes[key]` so the PDF renderer prints either the numeric
// value, "N/A" or "TBD" via resolveModeValue.
//
// Three render states the wizard payload can express:
//   - mode = "value" + numeric > 0 → display value
//   - mode = "value" + empty / 0   → row hides in PDF (no auto-default)
//   - mode = "na" or "tbd"         → row prints the literal sentinel
export function ModedNumericField({
  label,
  value,
  mode,
  onValueChange,
  onModeChange,
  min,
  max,
  step,
  ariaPrefix
}: {
  label: string;
  value: number | null;
  mode: ValueMode;
  onValueChange: (next: number | null) => void;
  onModeChange: (next: ValueMode) => void;
  min?: number;
  max?: number;
  step?: number;
  ariaPrefix?: string;
}) {
  const prefix = ariaPrefix ?? label.replace(/\W+/g, "-").toLowerCase();
  const locked = mode !== "value";
  return (
    <div>
      <span className="field-label">{label}</span>
      <div className="mb-2 flex flex-wrap gap-2">
        <MiniToggle
          label="Number"
          selected={mode === "value"}
          onSelect={() => onModeChange("value")}
          ariaLabel={`${prefix} mode: number`}
        />
        <MiniToggle
          label="N/A"
          selected={mode === "na"}
          onSelect={() => onModeChange("na")}
          ariaLabel={`${prefix} mode: N/A`}
        />
        <MiniToggle
          label="TBD"
          selected={mode === "tbd"}
          onSelect={() => onModeChange("tbd")}
          ariaLabel={`${prefix} mode: TBD`}
        />
      </div>
      <input
        className={fieldInputClass(locked)}
        type="text"
        inputMode="decimal"
        value={value ?? ""}
        onChange={event => onValueChange(parseNullableNumber(event.target.value))}
        aria-label={label}
        placeholder={
          locked
            ? `Locked — cell renders as ${mode === "na" ? "N/A" : "TBD"}`
            : "leave empty to hide row"
        }
        readOnly={locked}
        aria-readonly={locked}
        min={min}
        max={max}
        step={step}
      />
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
