import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  DocumentWizardPanel,
  buildDocumentHeaderMetaFromCalculator,
  buildDocumentTemplatePayloadManualBlank,
  buildDocumentTemplatePayloadManualDefaults,
  buildDocumentTemplatePayloadFromCalculator,
  buildOfferPdfHtml,
  clampStepToScope
} from "../components/document-wizard/index.js";
import type { DocumentTemplatePayload, WizardStep } from "../components/document-wizard/index.js";
import type { DocumentScope } from "../components/document-wizard/legalDefaults.js";
import { SaveDocumentModal } from "../components/SaveDocumentModal.js";
import type * as documentsApi from "../api/documents.js";
import { useCalculator } from "../contexts/CalculatorContext.js";
import { printHtmlViaIframe } from "../lib/printHtmlViaIframe.js";

/**
 * Map the wizard's camelCase document scope to the backend's
 * snake_case CHECK enum. Wizard doesn't have a standalone
 * "agreement" mode (product decision — see buildOfferPdfHtml.ts
 * comment) so only two values reach this function in practice.
 */
function toBackendScope(scope: DocumentScope): documentsApi.DocumentScope {
  if (scope === "offerAndAgreement") return "offer_and_agreement";
  return "offer";
}

type WizardSourceMode = "calculator" | "manualBlank" | "manualDefaults";

const SOURCE_MODES: ReadonlyArray<WizardSourceMode> = [
  "calculator",
  "manualBlank",
  "manualDefaults"
];
const SCOPES: ReadonlyArray<DocumentScope> = ["offer", "offerAndAgreement"];
const VALID_STEPS: ReadonlyArray<WizardStep> = [1, 2, 3, 4, 5, 6, 7];

function parseSourceMode(value: string | null): WizardSourceMode | null {
  if (!value) return null;
  return SOURCE_MODES.find(mode => mode === value) ?? null;
}

function parseScope(value: string | null): DocumentScope | null {
  if (!value) return null;
  return SCOPES.find(scope => scope === value) ?? null;
}

function parseStep(value: string | null): WizardStep | null {
  if (!value) return null;
  const parsed = Number(value);
  return VALID_STEPS.find(step => step === parsed) ?? null;
}

export function WizardPage() {
  const calc = useCalculator();
  const [searchParams, setSearchParams] = useSearchParams();

  const calculatorHeaderSeed = useMemo(
    () =>
      buildDocumentHeaderMetaFromCalculator(
        calc.payinEuPricing.model,
        calc.payinWwPricing.model
      ),
    [calc.payinEuPricing.model, calc.payinWwPricing.model]
  );

  const calculatorWizardSeed = useMemo(
    () =>
      buildDocumentTemplatePayloadFromCalculator({
        header: calculatorHeaderSeed,
        calculatorType: calc.calculatorType,
        payin: calc.payin,
        payout: calc.payout,
        payinEuPricing: calc.payinEuPricing,
        payinWwPricing: calc.payinWwPricing,
        payoutPricing: calc.payoutPricing,
        payoutMinimumFeeEnabled: calc.payoutMinimumFeeEnabled,
        payoutMinimumFeePerTransaction: calc.payoutMinimumFeePerTransaction,
        threeDsEnabled: calc.threeDsEnabled,
        threeDsRevenuePerSuccessfulTransaction: calc.threeDsRevenuePerSuccessfulTransaction,
        settlementIncluded: calc.settlementIncluded,
        settlementFeeEnabled: calc.settlementFeeEnabled,
        settlementFeeRatePercent: calc.settlementFeeRatePercent,
        monthlyMinimumFeeEnabled: calc.monthlyMinimumFeeEnabled,
        monthlyMinimumFeeAmount: calc.monthlyMinimumFeeAmount,
        failedTrxEnabled: calc.failedTrxEnabled,
        failedTrxMode: calc.failedTrxMode,
        failedTrxOverLimitThresholdPercent: calc.failedTrxOverLimitThresholdPercent,
        contractSummarySettings: calc.contractSummarySettings
      }),
    [
      calc.calculatorType,
      calc.contractSummarySettings,
      calc.failedTrxEnabled,
      calc.failedTrxMode,
      calc.failedTrxOverLimitThresholdPercent,
      calc.monthlyMinimumFeeAmount,
      calc.monthlyMinimumFeeEnabled,
      calc.payin,
      calc.payinEuPricing,
      calc.payinWwPricing,
      calc.payout,
      calc.payoutMinimumFeeEnabled,
      calc.payoutMinimumFeePerTransaction,
      calc.payoutPricing,
      calc.settlementFeeEnabled,
      calc.settlementFeeRatePercent,
      calc.settlementIncluded,
      calc.threeDsEnabled,
      calc.threeDsRevenuePerSuccessfulTransaction,
      calculatorHeaderSeed
    ]
  );

  // Read URL params on first mount to seed initial state.
  const initialSource = parseSourceMode(searchParams.get("source")) ?? "calculator";
  const initialScope = parseScope(searchParams.get("scope"));
  const initialStep = parseStep(searchParams.get("step")) ?? 1;

  const [wizardDraft, setWizardDraft] = useState<DocumentTemplatePayload>(() => {
    const seed =
      initialSource === "manualBlank"
        ? buildDocumentTemplatePayloadManualBlank()
        : initialSource === "manualDefaults"
          ? buildDocumentTemplatePayloadManualDefaults()
          : calculatorWizardSeed;
    if (initialScope) {
      return { ...seed, documentScope: initialScope };
    }
    return seed;
  });
  const [wizardSourceMode, setWizardSourceMode] = useState<WizardSourceMode>(initialSource);
  const [wizardStep, setWizardStep] = useState<WizardStep>(initialStep);
  const [wizardActionMessage, setWizardActionMessage] = useState<string | null>(null);
  const [wizardHighlightVariables, setWizardHighlightVariables] = useState(false);

  // Keep URL params in sync with wizard state. Replace history entry to avoid
  // pushing every keystroke into history.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("source", wizardSourceMode);
    next.set("scope", wizardDraft.documentScope);
    next.set("step", String(wizardStep));
    setSearchParams(next, { replace: true });
  }, [wizardSourceMode, wizardDraft.documentScope, wizardStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clamp activeStep when scope hides current step.
  useEffect(() => {
    setWizardStep(current => clampStepToScope(wizardDraft.documentScope, current));
  }, [wizardDraft.documentScope]);

  const wizardPreviewHtml = useMemo(
    () => buildOfferPdfHtml(wizardDraft, { highlightVariables: wizardHighlightVariables }),
    [wizardDraft, wizardHighlightVariables]
  );
  const wizardPdfHtml = useMemo(() => buildOfferPdfHtml(wizardDraft), [wizardDraft]);

  useEffect(() => {
    setWizardActionMessage(null);
  }, [wizardPreviewHtml]);

  const preserveCarryOver = (source: DocumentTemplatePayload): DocumentTemplatePayload => {
    // R6: keep documentScope and agreementParties stable when user switches source mode,
    // so toggling Manual blank/defaults does not silently reset the chosen scope or party data.
    return {
      ...source,
      documentScope: wizardDraft.documentScope,
      agreementParties: { ...wizardDraft.agreementParties }
    };
  };

  const handleWizardRefillFromCalculator = () => {
    setWizardDraft(preserveCarryOver(calculatorWizardSeed));
    setWizardSourceMode("calculator");
    setWizardActionMessage("Wizard fields were refilled from current calculator data.");
  };

  const handleWizardStartFromCalculator = () => {
    setWizardDraft(preserveCarryOver(calculatorWizardSeed));
    setWizardSourceMode("calculator");
    setWizardStep(1);
    setWizardActionMessage("Wizard source switched to calculator data.");
  };

  const handleWizardStartFromManualBlank = () => {
    setWizardDraft(preserveCarryOver(buildDocumentTemplatePayloadManualBlank()));
    setWizardSourceMode("manualBlank");
    setWizardStep(1);
    setWizardActionMessage("Wizard source switched to manual blank mode.");
  };

  const handleWizardStartFromManualDefaults = () => {
    setWizardDraft(preserveCarryOver(buildDocumentTemplatePayloadManualDefaults()));
    setWizardSourceMode("manualDefaults");
    setWizardStep(1);
    setWizardActionMessage("Wizard source switched to manual defaults mode.");
  };

  const handleWizardGeneratePdf = () => {
    const ok = printHtmlViaIframe(wizardPdfHtml);
    if (!ok) {
      setWizardActionMessage("Could not open the print dialog in this environment.");
      return;
    }
    setWizardActionMessage('Print dialog opened. Choose "Save as PDF" to export.');
  };

  // Sprint 4.E: "Save document" — opens SaveDocumentModal on the
  // last wizard step (Parties & Signatures, step 7). The modal
  // collects company + optional deal + addendum and POSTs to
  // /api/v1/documents. Backend allocates BSG-XXXXX atomically.
  const [saveDocOpen, setSaveDocOpen] = useState(false);
  const isLastStep = wizardStep === 7;

  return (
    <>
      {isLastStep ? (
        <div className="mb-4 flex flex-col gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-blue-900">Ready to save?</h2>
            <p className="mt-1 text-xs text-blue-800">
              The backend will assign the next BSG-XXXXX number atomically. You
              can attach the document to a company + optional deal.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSaveDocOpen(true)}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
          >
            Save document…
          </button>
        </div>
      ) : null}

      <DocumentWizardPanel
        draft={wizardDraft}
        onDraftChange={setWizardDraft}
        sourceMode={wizardSourceMode}
        onStartFromCalculator={handleWizardStartFromCalculator}
        onStartFromManualBlank={handleWizardStartFromManualBlank}
        onStartFromManualDefaults={handleWizardStartFromManualDefaults}
        activeStep={wizardStep}
        onStepChange={setWizardStep}
        previewHtml={wizardPreviewHtml}
        highlightVariables={wizardHighlightVariables}
        onHighlightVariablesChange={setWizardHighlightVariables}
        onGeneratePdf={handleWizardGeneratePdf}
        onRefreshFromCalculator={handleWizardRefillFromCalculator}
        actionMessage={wizardActionMessage}
      />

      <SaveDocumentModal
        open={saveDocOpen}
        onClose={() => setSaveDocOpen(false)}
        payload={wizardDraft as unknown as { schemaVersion?: number } & Record<string, unknown>}
        scope={toBackendScope(wizardDraft.documentScope)}
      />
    </>
  );
}
