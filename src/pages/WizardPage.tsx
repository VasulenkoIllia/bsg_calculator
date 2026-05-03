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
import { useCalculator } from "../contexts/CalculatorContext.js";

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
    if (typeof window === "undefined") return;

    const popup = window.open("", "_blank", "noopener,noreferrer,width=1120,height=880");
    if (!popup) {
      setWizardActionMessage("Popup was blocked. Please allow popups, then retry PDF generation.");
      return;
    }

    popup.document.open();
    popup.document.write(wizardPdfHtml);
    popup.document.close();
    popup.focus();
    popup.print();

    setWizardActionMessage('Print dialog opened. Choose "Save as PDF" to export.');
  };

  return (
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
  );
}
