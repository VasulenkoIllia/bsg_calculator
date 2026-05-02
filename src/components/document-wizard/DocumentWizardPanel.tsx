import { HeaderMetaStep } from "./wizard/steps/HeaderMetaStep.js";
import { OtherFeesStep } from "./wizard/steps/OtherFeesStep.js";
import { PayinStep } from "./wizard/steps/PayinStep.js";
import { PayoutStep } from "./wizard/steps/PayoutStep.js";
import { PreviewStep } from "./wizard/steps/PreviewStep.js";
import { TermsStep } from "./wizard/steps/TermsStep.js";
import { Stepper } from "./wizard/shared.js";
import type { DocumentTemplatePayload, WizardStep } from "./types.js";

type SourceMode = "calculator" | "manualBlank" | "manualDefaults";

export interface DocumentWizardPanelProps {
  draft: DocumentTemplatePayload;
  onDraftChange: (next: DocumentTemplatePayload) => void;
  sourceMode: SourceMode;
  onStartFromCalculator: () => void;
  onStartFromManualBlank: () => void;
  onStartFromManualDefaults: () => void;
  activeStep: WizardStep;
  onStepChange: (step: WizardStep) => void;
  previewHtml: string;
  onGeneratePdf: () => void;
  onRefreshFromCalculator: () => void;
  actionMessage: string | null;
}

export function DocumentWizardPanel({
  draft,
  onDraftChange,
  sourceMode,
  onStartFromCalculator,
  onStartFromManualBlank,
  onStartFromManualDefaults,
  activeStep,
  onStepChange,
  previewHtml,
  onGeneratePdf,
  onRefreshFromCalculator,
  actionMessage
}: DocumentWizardPanelProps) {
  return (
    <section className="panel mx-auto mt-6 max-w-6xl p-5 md:p-7">
      <h2 className="zone-title">Contract Wizard (Phase 1)</h2>
      <p className="mt-1 text-sm text-slate-600">
        Select source, confirm or adjust Step 1-5 blocks, then generate PDF in Step 6.
      </p>
      <div className="mt-4 grid gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
            Document Source
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onStartFromCalculator}
              className={[
                "rounded-xl border px-4 py-2 text-sm font-semibold transition",
                sourceMode === "calculator"
                  ? "border-blue-400 bg-blue-50 text-blue-900"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
              ].join(" ")}
            >
              From Calculator
            </button>
            <button
              type="button"
              onClick={onStartFromManualBlank}
              className={[
                "rounded-xl border px-4 py-2 text-sm font-semibold transition",
                sourceMode === "manualBlank"
                  ? "border-blue-400 bg-blue-50 text-blue-900"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
              ].join(" ")}
            >
              Manual (blank)
            </button>
            <button
              type="button"
              onClick={onStartFromManualDefaults}
              className={[
                "rounded-xl border px-4 py-2 text-sm font-semibold transition",
                sourceMode === "manualDefaults"
                  ? "border-blue-400 bg-blue-50 text-blue-900"
                  : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
              ].join(" ")}
            >
              Manual (defaults)
            </button>
          </div>
        </div>

        <Stepper activeStep={activeStep} onStepChange={onStepChange} />

        {activeStep === 1 ? (
          <HeaderMetaStep
            draft={draft}
            onDraftChange={onDraftChange}
            onRefreshFromCalculator={onRefreshFromCalculator}
            onContinueToPayin={() => onStepChange(2)}
            onContinueToPreview={() => onStepChange(6)}
          />
        ) : null}

        {activeStep === 2 ? (
          <PayinStep
            draft={draft}
            onDraftChange={onDraftChange}
            onBack={() => onStepChange(1)}
            onNext={() => onStepChange(3)}
          />
        ) : null}

        {activeStep === 3 ? (
          <PayoutStep
            draft={draft}
            onDraftChange={onDraftChange}
            onBack={() => onStepChange(2)}
            onNext={() => onStepChange(4)}
          />
        ) : null}

        {activeStep === 4 ? (
          <OtherFeesStep
            draft={draft}
            onDraftChange={onDraftChange}
            onBack={() => onStepChange(3)}
            onNext={() => onStepChange(5)}
          />
        ) : null}

        {activeStep === 5 ? (
          <TermsStep
            draft={draft}
            onDraftChange={onDraftChange}
            onBack={() => onStepChange(4)}
            onNext={() => onStepChange(6)}
          />
        ) : null}

        {activeStep === 6 ? (
          <PreviewStep
            previewHtml={previewHtml}
            onBack={() => onStepChange(5)}
            onGeneratePdf={onGeneratePdf}
          />
        ) : null}

        {actionMessage ? (
          <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            {actionMessage}
          </p>
        ) : null}
      </div>
    </section>
  );
}
