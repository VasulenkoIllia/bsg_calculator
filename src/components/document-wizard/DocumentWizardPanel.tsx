import { HeaderMetaStep } from "./wizard/steps/HeaderMetaStep.js";
import { OtherFeesStep } from "./wizard/steps/OtherFeesStep.js";
import { PayinStep } from "./wizard/steps/PayinStep.js";
import { PayoutStep } from "./wizard/steps/PayoutStep.js";
import { PreviewStep } from "./wizard/steps/PreviewStep.js";
import { TermsStep } from "./wizard/steps/TermsStep.js";
import { Stepper } from "./wizard/shared.js";
import type { DocumentWizardTemplateData, WizardStep } from "./types.js";

export interface DocumentWizardPanelProps {
  draft: DocumentWizardTemplateData;
  onDraftChange: (next: DocumentWizardTemplateData) => void;
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
        Calculator data is loaded into all blocks. Confirm or adjust Step 1-5 and generate PDF in
        Step 6.
      </p>
      <div className="mt-4 grid gap-4">
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
