import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
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
import { WizardBackendBar } from "../components/WizardBackendBar.js";
import * as documentsApi from "../api/documents.js";
import type { PublicCompany } from "../api/types.js";
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

  // Sprint 4.E (revised 2026-05-17): "Save document" target is
  // picked on Step 1 (Header / Meta) next to Document Type +
  // Document Number, so the operator sees the full BSG-XXXXXXX-YYYYYY
  // preview before touching pricing. Save button is inside the bar
  // (disabled until a company is picked). Modal only collects the
  // addendum.
  const [selectedCompany, setSelectedCompany] = useState<PublicCompany | null>(null);
  const [selectedDealId, setSelectedDealId] = useState<string>("");
  const [saveDocOpen, setSaveDocOpen] = useState(false);

  const backendScope = toBackendScope(wizardDraft.documentScope);

  // Live BSG-<seq>-<suffix> preview from the backend. When no company
  // is picked, the backend returns "BSG-7100024-XXXXXX" so the
  // operator visually sees that the suffix waits on company choice.
  // staleTime 10s keeps the seq fresh against other tabs without
  // hammering the endpoint.
  const numberPeek = useQuery({
    queryKey: ["numbering", "peek", selectedCompany?.hubspotCompanyId ?? null],
    queryFn: () =>
      documentsApi.peekNextNumber(
        selectedCompany
          ? { hubspotCompanyId: selectedCompany.hubspotCompanyId }
          : undefined
      ),
    staleTime: 10_000
  });

  // Push the peek result into the wizard's documentNumber field so
  // Step 1's input shows the live BSG-XXXXXXX-YYYYYY rather than the
  // legacy BSG-DRAFT-XXXXX placeholder. We only overwrite when the
  // current value still looks like a placeholder so a hand-edit by
  // the operator isn't clobbered by the next peek refresh.
  useEffect(() => {
    const next = numberPeek.data?.next;
    if (!next) return;
    const current = wizardDraft.header.documentNumber;
    const looksLikePlaceholder =
      current.startsWith("BSG-DRAFT-") || current.startsWith("BSG-") === false || current.endsWith("XXXXXX") || current === next;
    if (!looksLikePlaceholder && current.length > 0) return;
    setWizardDraft(prev => ({
      ...prev,
      header: { ...prev.header, documentNumber: next }
    }));
  }, [numberPeek.data?.next]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
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
        headerStepBeforeContent={
          <WizardBackendBar
            selectedCompany={selectedCompany}
            onCompanyChange={setSelectedCompany}
            selectedDealId={selectedDealId}
            onDealIdChange={setSelectedDealId}
            onOpenSaveDialog={() => setSaveDocOpen(true)}
          />
        }
        onSaveDocument={() => setSaveDocOpen(true)}
        saveDisabledReason={
          selectedCompany ? null : "Pick a company on Step 1 first."
        }
      />

      {selectedCompany ? (
        <SaveDocumentModal
          open={saveDocOpen}
          onClose={() => setSaveDocOpen(false)}
          companyId={selectedCompany.id}
          hubspotDealId={selectedDealId}
          companyName={selectedCompany.name}
          payload={wizardDraft as unknown as { schemaVersion?: number } & Record<string, unknown>}
          scope={backendScope}
        />
      ) : null}
    </>
  );
}
