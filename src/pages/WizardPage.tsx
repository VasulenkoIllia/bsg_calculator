import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  seedCalculatorStateFromSnapshot,
  type CalculatorSnapshotPayload
} from "../components/calculator/snapshotShape.js";
import { SaveDocumentModal } from "../components/SaveDocumentModal.js";
import { WizardBackendBar } from "../components/WizardBackendBar.js";
import { ApiError } from "../api/client.js";
import * as documentsApi from "../api/documents.js";
import { renderPdfPreview, triggerPdfDownload } from "../api/pdf.js";
import type { PublicCompany } from "../api/types.js";
import { useCalculator } from "../contexts/CalculatorContext.js";
import { useToast } from "../contexts/ToastContext.js";
import { useCalculatorConfig } from "../hooks/useCalculatorConfig.js";
import { useCompany } from "../hooks/useCompany.js";

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
  const toast = useToast();
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

  // Sprint 6.0: only the on-screen iframe preview is rendered
  // client-side now (with the `highlightVariables` toggle so the
  // operator can see which fields are user-filled vs. defaults).
  // The "Generate PDF" download path goes through the backend
  // `/api/v1/pdf/preview` Puppeteer pipeline — no more
  // browser-native window.print() with its per-browser variance.
  const wizardPreviewHtml = useMemo(
    () => buildOfferPdfHtml(wizardDraft, { highlightVariables: wizardHighlightVariables }),
    [wizardDraft, wizardHighlightVariables]
  );

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

  // Sprint 6.0: "Generate PDF" routes through the backend
  // `POST /api/v1/pdf/preview` endpoint instead of the previous
  // browser-native window.print() → Save as PDF path. Same render
  // engine (Puppeteer Chromium) as the saved-document Download PDF —
  // no Safari/Firefox variability, no print-dialog options to
  // worry about, no browser-injected headers/footers.
  const [wizardPdfPending, setWizardPdfPending] = useState(false);

  const handleWizardGeneratePdf = async () => {
    setWizardPdfPending(true);
    try {
      const blob = await renderPdfPreview(wizardDraft);
      // Use the current Document Number as the filename when it
      // looks like a real BSG-XXXXXXX-YYYYYY (i.e. the numbering
      // peek has resolved with a company). Fall back to a generic
      // "preview" otherwise so the file doesn't carry the
      // placeholder XXXXXX or DRAFT prefix into the user's downloads.
      const docNumber = wizardDraft.header.documentNumber;
      const looksFinal = /^BSG-\d{7}-[0-9A-Z]{6}$/i.test(docNumber);
      const filename = looksFinal ? `${docNumber}.pdf` : "preview.pdf";
      triggerPdfDownload(blob, filename);
      toast.success("PDF generated and downloaded.");
    } catch (err) {
      // Sprint 6.F.1 (audit U2): drop the misleading "check the
      // draft is complete" suggestion — the realistic failure mode
      // here is a Puppeteer crash or a 503 from a restarting backend,
      // not missing fields (field-level validation surfaces as a 400
      // with err.message that takes priority).
      const msg =
        err instanceof ApiError
          ? err.message
          : "PDF generation failed. The server may be restarting — try again in a moment.";
      toast.error(msg);
    } finally {
      setWizardPdfPending(false);
    }
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

  // ─── Sprint 6.2-FIX: wizard-from-calc linking ────────────────────
  // When the wizard is opened with `?calc=<configId>` (set by the
  // "Open Contract Wizard" button on /calc/:id), we:
  //   1. Fetch the calculator-config to learn which company/deal
  //      it belongs to (the wizard's BSG number + the resulting
  //      Document's FK chain both need this).
  //   2. Hydrate the global CalculatorContext from the config's
  //      payload so the wizard's "Source: Calculator" mode reads
  //      the right pricing — covers the case of someone deep-linking
  //      to /wizard?calc=<id> without first visiting /calc/:id.
  //   3. Auto-pick the company + deal in WizardBackendBar so the
  //      operator doesn't have to re-pick the same target they
  //      already chose on the calculator page.
  //   4. Pass `calculatorConfigId` to SaveDocumentModal so the
  //      saved Document's `calculator_config_id` FK gets set —
  //      this is how the operator can later see "which calc did
  //      this document come from" + how a calc page can show
  //      "documents derived from this calculator" (Sprint 6.4+).
  const linkedConfigId = searchParams.get("calc");
  const linkedConfigQuery = useCalculatorConfig(linkedConfigId ?? undefined);
  const linkedCompanyQuery = useCompany(linkedConfigQuery.data?.companyId);

  // (1) + (2): hydrate CalculatorContext once per configId.
  const linkedHydratedFromRef = useRef<string | null>(null);
  useEffect(() => {
    if (!linkedConfigId) return;
    if (!linkedConfigQuery.data) return;
    if (linkedHydratedFromRef.current === linkedConfigId) return;
    try {
      const preset = seedCalculatorStateFromSnapshot(
        linkedConfigQuery.data.payload as unknown as CalculatorSnapshotPayload
      );
      calc.applyStatePreset(preset);
      linkedHydratedFromRef.current = linkedConfigId;
      // Also re-seed the wizard draft itself from the freshly-applied
      // calculator state so the on-screen preview reflects the
      // linked config immediately (without waiting for the user to
      // hit the "Source: Calculator" radio).
      setWizardSourceMode("calculator");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[WizardPage] linked calc hydrate failed", err);
    }
    // We deliberately exclude `calc` from the dep array — applyStatePreset
    // is referentially stable across re-renders, and including the whole
    // context would re-trigger the effect on every state mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedConfigId, linkedConfigQuery.data]);

  // (3): seed WizardBackendBar selection from the linked config.
  // Only fires once per configId so a manual change in the bar
  // afterwards isn't clobbered on every re-render.
  const linkedBarSeededRef = useRef<string | null>(null);
  useEffect(() => {
    if (!linkedConfigId) return;
    if (!linkedConfigQuery.data) return;
    if (!linkedCompanyQuery.data) return;
    if (linkedBarSeededRef.current === linkedConfigId) return;
    setSelectedCompany(linkedCompanyQuery.data);
    setSelectedDealId(linkedConfigQuery.data.hubspotDealId ?? "");
    linkedBarSeededRef.current = linkedConfigId;
  }, [linkedConfigId, linkedConfigQuery.data, linkedCompanyQuery.data]);

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

  // Push the peek result into the wizard's documentNumber field.
  //
  // Heuristic: we want the field to track the backend's preview when
  // the operator hasn't manually edited it, but PRESERVE a hand-edit
  // when they have. The earlier (Sprint 4.E.1) implementation gated
  // overwrites on "looksLikePlaceholder" — BSG-DRAFT- prefix, non-BSG,
  // XXXXXX suffix, or value equal to incoming peek. That heuristic
  // broke when the operator switched companies: the current value
  // was a real BSG-7100001-AAAAAA from the previous peek (not a
  // placeholder), so the new BSG-7100001-BBBBBB peek for the new
  // company was silently dropped and the wizard kept showing AAAAAA.
  //
  // The robust pattern is to track the last value WE pushed into the
  // field via a ref. Overwrite freely as long as the current value
  // still equals our last write — that means the operator has not
  // touched it. The moment current !== lastWritten, we know it's been
  // hand-edited and we leave it alone for the rest of the session.
  const lastPeekWrittenRef = useRef<string | null>(null);
  useEffect(() => {
    const next = numberPeek.data?.next;
    if (!next) return;
    const current = wizardDraft.header.documentNumber;

    // Empty (e.g. just-cleared) AND any value we wrote previously
    // are both safe to overwrite. Anything else is a hand-edit.
    const safeToOverwrite =
      current.length === 0 ||
      current === lastPeekWrittenRef.current ||
      current.startsWith("BSG-DRAFT-") ||
      current.endsWith("XXXXXX");
    if (!safeToOverwrite) return;
    if (current === next) return; // already up-to-date

    lastPeekWrittenRef.current = next;
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
        generatePdfPending={wizardPdfPending}
        onRefreshFromCalculator={handleWizardRefillFromCalculator}
        actionMessage={wizardActionMessage}
        headerStepBeforeContent={
          <WizardBackendBar
            selectedCompany={selectedCompany}
            onCompanyChange={setSelectedCompany}
            selectedDealId={selectedDealId}
            onDealIdChange={setSelectedDealId}
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
          payload={wizardDraft}
          scope={backendScope}
          // Sprint 6.2-FIX: when the wizard was opened via
          // /wizard?calc=<id>, propagate the source calculator-config
          // id all the way to POST /documents so the saved Document
          // row's FK `calculator_config_id` is populated — this
          // links the document back to its source for future history
          // views ("documents from this calculator").
          calculatorConfigId={linkedConfigId}
        />
      ) : null}
    </>
  );
}
