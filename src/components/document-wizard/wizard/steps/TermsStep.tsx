import type { DocumentTemplatePayload } from "../../types.js";
import { StepNavigation } from "../shared.js";
import {
  CustomTermsBlocksSection,
  PayinMinimumFeeSection,
  RollingReserveSection,
  TermsLegalSection,
  TransactionLimitsSection
} from "./terms/index.js";

// Step 5 orchestrator. The card body is composed from focused
// sub-sections under `terms/` so each card has its own file and the
// wizard step itself stays a thin layout shell.
export function TermsStep({
  draft,
  onDraftChange,
  onBack,
  onNext
}: {
  draft: DocumentTemplatePayload;
  onDraftChange: (next: DocumentTemplatePayload) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h3 className="text-lg font-bold text-slate-900">Step 5. Terms & Limitations</h3>
      <p className="mt-1 text-sm text-slate-600">
        Terms block controls section 4 in generated PDF.
      </p>

      <div className="mt-4 grid gap-4">
        <TermsLegalSection draft={draft} onDraftChange={onDraftChange} />
        <TransactionLimitsSection draft={draft} onDraftChange={onDraftChange} />
        <RollingReserveSection draft={draft} onDraftChange={onDraftChange} />
        <PayinMinimumFeeSection draft={draft} onDraftChange={onDraftChange} />
        <CustomTermsBlocksSection draft={draft} onDraftChange={onDraftChange} />
      </div>

      <StepNavigation
        onBack={onBack}
        onNext={onNext}
        backLabel="Back: Step 4"
        nextLabel="Next: Step 6 (Preview)"
      />
    </div>
  );
}
