import { useEffect, useMemo, useState } from "react";
import { buildOfferSummaryText } from "./domain/calculator/index.js";
import {
  CalculatorActionsPanel,
  CalculatorHeader,
  HardcodedConstantsPanel,
  Zone0CalculatorType,
  Zone1PayinTraffic,
  Zone1PayoutTraffic,
  Zone2IntroducerCommission,
  Zone3PricingConfiguration,
  Zone4OtherFeesAndLimits,
  Zone5ProfitabilityCalculations,
  Zone6OfferSummary,
  escapeHtml
} from "./components/calculator/index.js";
import {
  DocumentWizardPanel,
  buildDocumentHeaderMetaFromCalculator,
  buildDocumentTemplatePayloadManualBlank,
  buildDocumentTemplatePayloadManualDefaults,
  buildDocumentTemplatePayloadFromCalculator,
  buildOfferPdfHtml
} from "./components/document-wizard/index.js";
import type { DocumentTemplatePayload, WizardStep } from "./components/document-wizard/index.js";
import { useCalculatorState } from "./components/calculator/useCalculatorState.js";
import { useCalculatorDerivedData } from "./components/calculator/useCalculatorDerivedData.js";

type WorkspacePage = "calculator" | "wizard";
type WizardSourceMode = "calculator" | "manualBlank" | "manualDefaults";

function WorkspaceTabs({
  activePage,
  onChange
}: {
  activePage: WorkspacePage;
  onChange: (page: WorkspacePage) => void;
}) {
  return (
    <section className="panel mb-6 border border-slate-200 bg-white p-4 md:p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
        Workspace
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange("calculator")}
          className={[
            "rounded-xl border px-4 py-2 text-sm font-semibold transition",
            activePage === "calculator"
              ? "border-blue-400 bg-blue-50 text-blue-900"
              : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
          ].join(" ")}
          aria-pressed={activePage === "calculator"}
        >
          Calculator
        </button>
        <button
          type="button"
          onClick={() => onChange("wizard")}
          className={[
            "rounded-xl border px-4 py-2 text-sm font-semibold transition",
            activePage === "wizard"
              ? "border-blue-400 bg-blue-50 text-blue-900"
              : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
          ].join(" ")}
          aria-pressed={activePage === "wizard"}
        >
          Contract Wizard & PDF
        </button>
      </div>
    </section>
  );
}

export default function App() {
  const {
    calculatorType,
    payinVolume,
    payinTransactions,
    approvalRatioPercent,
    euPercent,
    ccPercent,
    payoutVolume,
    payoutTransactions,
    introducerEnabled,
    introducerCommissionType,
    customTier1UpToMillion,
    customTier2UpToMillion,
    customTier1RatePerMillion,
    customTier2RatePerMillion,
    customTier3RatePerMillion,
    revSharePercent,
    settlementIncluded,
    payinEuPricing,
    payinWwPricing,
    payoutPricing,
    payoutMinimumFeeEnabled,
    payoutMinimumFeePerTransaction,
    threeDsEnabled,
    threeDsRevenuePerSuccessfulTransaction,
    settlementFeeEnabled,
    settlementFeeRatePercent,
    monthlyMinimumFeeEnabled,
    monthlyMinimumFeeAmount,
    failedTrxEnabled,
    failedTrxMode,
    failedTrxOverLimitThresholdPercent,
    contractSummarySettings,
    clientNotes,
    offerSummaryActionMessage,
    showHardcodedConstants,
    showZone3Formulas,
    showZone4Formulas,
    showUnifiedFormulas,
    unifiedExpandedById,
    zoneExpanded,
    wwPercent,
    apmPercent,
    hardcodedConstantGroups,
    setPayinEnabled,
    setPayoutEnabled,
    resetAllValuesToZero,
    applyDefaultValues,
    toggleHardcodedConstantsAndZoneFormulas,
    handleEuChange,
    handleWwChange,
    handleCcChange,
    handleApmChange,
    handleCustomTier1UpToChange,
    handleCustomTier2UpToChange,
    handleRevSharePercentChange,
    setPayinRegionModel,
    setPayinRegionRateMode,
    setPayinRegionTrxEnabled,
    setPayinRegionSingleField,
    setPayinRegionTierField,
    setPayinRegionTierBoundary,
    setPayoutRateMode,
    setPayoutSingleField,
    setPayoutTierField,
    setPayoutTierBoundary,
    setContractSummaryField,
    toggleZone,
    getZoneNavigation,
    setClientNotes,
    setPayinVolume,
    setPayinTransactions,
    setApprovalRatioPercent,
    setPayoutVolume,
    setPayoutTransactions,
    setOfferSummaryActionMessage,
    setPayoutMinimumFeeEnabled,
    setPayoutMinimumFeePerTransaction,
    setThreeDsEnabled,
    setThreeDsRevenuePerSuccessfulTransaction,
    setSettlementFeeEnabled,
    setSettlementFeeRatePercent,
    setMonthlyMinimumFeeEnabled,
    setMonthlyMinimumFeeAmount,
    setFailedTrxEnabled,
    setFailedTrxMode,
    setFailedTrxOverLimitThresholdPercent,
    setSettlementIncluded,
    setIntroducerEnabled,
    setIntroducerCommissionType,
    setCustomTier1RatePerMillion,
    setCustomTier2RatePerMillion,
    setCustomTier3RatePerMillion,
    setUnifiedExpandedById,
    setShowUnifiedFormulas
  } = useCalculatorState();

  const {
    payin,
    payout,
    introducerBaseVolume,
    standardIntroducer,
    customIntroducer,
    payinEuPreview,
    payinWwPreview,
    payoutPreview,
    payoutRateMinimumAdjustments,
    payoutSingleRateMinimumAdjustment,
    payinBaseRevenue,
    effectiveFailedTrxFees,
    payoutMinimumFeeImpact,
    payoutRevenueAdjusted,
    threeDsImpact,
    settlementFeeImpact,
    monthlyMinimumFeeImpact,
    failedTrxImpact,
    revShareIntroducer,
    unifiedProfitabilityTree,
    expandAllUnifiedRows,
    collapseAllUnifiedRows,
    toggleUnifiedRow
  } = useCalculatorDerivedData({
    calculatorType,
    payinVolume,
    payinTransactions,
    approvalRatioPercent,
    euPercent,
    ccPercent,
    payoutVolume,
    payoutTransactions,
    introducerEnabled,
    introducerCommissionType,
    customTier1UpToMillion,
    customTier2UpToMillion,
    customTier1RatePerMillion,
    customTier2RatePerMillion,
    customTier3RatePerMillion,
    revSharePercent,
    settlementIncluded,
    payinEuPricing,
    payinWwPricing,
    payoutPricing,
    payoutMinimumFeeEnabled,
    payoutMinimumFeePerTransaction,
    threeDsEnabled,
    threeDsRevenuePerSuccessfulTransaction,
    settlementFeeEnabled,
    settlementFeeRatePercent,
    monthlyMinimumFeeEnabled,
    monthlyMinimumFeeAmount,
    failedTrxEnabled,
    failedTrxMode,
    failedTrxOverLimitThresholdPercent,
    setUnifiedExpandedById
  });

  const calculatorHeaderSeed = useMemo(
    () => buildDocumentHeaderMetaFromCalculator(payinEuPricing.model, payinWwPricing.model),
    [payinEuPricing.model, payinWwPricing.model]
  );
  const calculatorWizardSeed = useMemo(
    () =>
      buildDocumentTemplatePayloadFromCalculator({
        header: calculatorHeaderSeed,
        calculatorType,
        payin,
        payout,
        payinEuPricing,
        payinWwPricing,
        payoutPricing,
        payoutMinimumFeeEnabled,
        payoutMinimumFeePerTransaction,
        threeDsEnabled,
        threeDsRevenuePerSuccessfulTransaction,
        settlementIncluded,
        settlementFeeEnabled,
        settlementFeeRatePercent,
        monthlyMinimumFeeEnabled,
        monthlyMinimumFeeAmount,
        failedTrxEnabled,
        failedTrxMode,
        failedTrxOverLimitThresholdPercent,
        contractSummarySettings
      }),
    [
      calculatorHeaderSeed,
      calculatorType,
      contractSummarySettings,
      failedTrxEnabled,
      failedTrxMode,
      failedTrxOverLimitThresholdPercent,
      monthlyMinimumFeeAmount,
      monthlyMinimumFeeEnabled,
      payin,
      payinEuPricing,
      payinWwPricing,
      payout,
      payoutMinimumFeeEnabled,
      payoutMinimumFeePerTransaction,
      payoutPricing,
      settlementFeeEnabled,
      settlementFeeRatePercent,
      settlementIncluded,
      threeDsEnabled,
      threeDsRevenuePerSuccessfulTransaction
    ]
  );
  const [wizardDraft, setWizardDraft] = useState<DocumentTemplatePayload>(calculatorWizardSeed);
  const [wizardSourceMode, setWizardSourceMode] = useState<WizardSourceMode>("calculator");
  const [wizardStep, setWizardStep] = useState<WizardStep>(1);
  const [wizardActionMessage, setWizardActionMessage] = useState<string | null>(null);
  const [workspacePage, setWorkspacePage] = useState<WorkspacePage>("calculator");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncFromHash = () => {
      const hash = window.location.hash.toLowerCase();
      if (hash === "#wizard") {
        setWorkspacePage("wizard");
        return;
      }
      setWorkspacePage("calculator");
    };

    syncFromHash();
    window.addEventListener("hashchange", syncFromHash);
    return () => window.removeEventListener("hashchange", syncFromHash);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const targetHash = workspacePage === "wizard" ? "#wizard" : "#calculator";
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, "", targetHash);
    }
  }, [workspacePage]);

  const offerSummaryText = useMemo(
    () =>
      buildOfferSummaryText({
        generatedAt: new Date(),
        clientNotes,
        calculatorType,
        payin,
        payout,
        settlementIncluded,
        payinEuPricing,
        payinWwPricing,
        payoutPricing,
        payoutMinimumFeeEnabled,
        payoutMinimumFeePerTransaction,
        threeDsEnabled,
        threeDsRevenuePerSuccessfulTransaction,
        settlementFeeEnabled,
        settlementFeeRatePercent,
        monthlyMinimumFeeEnabled,
        monthlyMinimumFeeAmount,
        failedTrxEnabled,
        failedTrxMode,
        failedTrxOverLimitThresholdPercent,
        contractSummary: contractSummarySettings,
        introducerEnabled,
        introducerCommissionType,
        standardIntroducer,
        customIntroducer,
        revShareIntroducer
      }),
    [
      calculatorType,
      clientNotes,
      contractSummarySettings,
      customIntroducer,
      failedTrxEnabled,
      failedTrxMode,
      failedTrxOverLimitThresholdPercent,
      introducerEnabled,
      introducerCommissionType,
      monthlyMinimumFeeAmount,
      monthlyMinimumFeeEnabled,
      payin,
      payinEuPricing,
      payinWwPricing,
      payout,
      payoutMinimumFeeEnabled,
      payoutMinimumFeePerTransaction,
      payoutPricing,
      revShareIntroducer,
      settlementFeeEnabled,
      settlementFeeRatePercent,
      settlementIncluded,
      standardIntroducer,
      threeDsEnabled,
      threeDsRevenuePerSuccessfulTransaction
    ]
  );

  useEffect(() => {
    setOfferSummaryActionMessage(null);
  }, [offerSummaryText]);

  const wizardPreviewHtml = useMemo(() => buildOfferPdfHtml(wizardDraft), [wizardDraft]);

  useEffect(() => {
    setWizardActionMessage(null);
  }, [wizardPreviewHtml]);

  const handleCopyOfferSummary = async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(offerSummaryText);
      setOfferSummaryActionMessage("Summary copied to clipboard.");
    } catch {
      setOfferSummaryActionMessage("Clipboard access is blocked. Copy the text manually from preview.");
    }
  };

  const openOfferSummaryPrintView = (mode: "pdf" | "print") => {
    if (typeof window === "undefined") return;

    const popup = window.open("", "_blank", "noopener,noreferrer,width=980,height=760");
    if (!popup) {
      setOfferSummaryActionMessage(
        "Popup was blocked. Please allow popups, then retry export/print."
      );
      return;
    }

    popup.document.open();
    popup.document.write(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>BSG Offer Summary</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; padding: 24px; font-family: Menlo, Monaco, Consolas, "Liberation Mono", monospace; background: #f8fafc; color: #0f172a; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; font-size: 13px; line-height: 1.55; border: 1px solid #cbd5e1; background: #ffffff; border-radius: 12px; padding: 16px; }
  </style>
</head>
<body>
  <pre>${escapeHtml(offerSummaryText)}</pre>
</body>
</html>`);
    popup.document.close();
    popup.focus();
    popup.print();

    setOfferSummaryActionMessage(
      mode === "pdf"
        ? "Print dialog opened. Choose \"Save as PDF\" to export."
        : "Print dialog opened."
    );
  };

  const handleExportOfferSummaryPdf = () => {
    openOfferSummaryPrintView("pdf");
  };

  const handlePrintOfferSummary = () => {
    openOfferSummaryPrintView("print");
  };

  const handleWizardRefillFromCalculator = () => {
    setWizardDraft(calculatorWizardSeed);
    setWizardSourceMode("calculator");
    setWizardActionMessage("Wizard fields were refilled from current calculator data.");
  };

  const handleWizardStartFromCalculator = () => {
    setWizardDraft(calculatorWizardSeed);
    setWizardSourceMode("calculator");
    setWizardStep(1);
    setWizardActionMessage("Wizard source switched to calculator data.");
  };

  const handleWizardStartFromManualBlank = () => {
    setWizardDraft(buildDocumentTemplatePayloadManualBlank());
    setWizardSourceMode("manualBlank");
    setWizardStep(1);
    setWizardActionMessage("Wizard source switched to manual blank mode.");
  };

  const handleWizardStartFromManualDefaults = () => {
    setWizardDraft(buildDocumentTemplatePayloadManualDefaults());
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
    popup.document.write(wizardPreviewHtml);
    popup.document.close();
    popup.focus();
    popup.print();

    setWizardActionMessage('Print dialog opened. Choose "Save as PDF" to export.');
  };

  const handleOpenWizardWorkspace = () => {
    setWorkspacePage("wizard");
    setWizardStep(1);
    setWizardDraft(calculatorWizardSeed);
    setWizardSourceMode("calculator");
  };

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-10">
        <CalculatorHeader />
        <WorkspaceTabs activePage={workspacePage} onChange={setWorkspacePage} />

        {workspacePage === "calculator" ? (
          <>
            <HardcodedConstantsPanel
              visible={showHardcodedConstants}
              groups={hardcodedConstantGroups}
            />
            <CalculatorActionsPanel
              showHardcodedConstants={showHardcodedConstants}
              onToggleConstantsAndFormulas={toggleHardcodedConstantsAndZoneFormulas}
              onReset={resetAllValuesToZero}
              onApplyDefaults={applyDefaultValues}
            />

            <Zone0CalculatorType
              expanded={zoneExpanded.zone0}
              onToggle={() => toggleZone("zone0")}
              calculatorType={calculatorType}
              onPayinEnabledChange={setPayinEnabled}
              onPayoutEnabledChange={setPayoutEnabled}
            />

            {calculatorType.payin ? (
              <Zone1PayinTraffic
                expanded={zoneExpanded.zone1a}
                onToggle={() => toggleZone("zone1a")}
                navigation={getZoneNavigation("zone1a")}
                payinVolume={payinVolume}
                payinTransactions={payinTransactions}
                approvalRatioPercent={approvalRatioPercent}
                euPercent={euPercent}
                wwPercent={wwPercent}
                ccPercent={ccPercent}
                apmPercent={apmPercent}
                payin={payin}
                onPayinVolumeChange={setPayinVolume}
                onPayinTransactionsChange={setPayinTransactions}
                onApprovalRatioPercentChange={setApprovalRatioPercent}
                onEuPercentChange={handleEuChange}
                onWwPercentChange={handleWwChange}
                onCcPercentChange={handleCcChange}
                onApmPercentChange={handleApmChange}
              />
            ) : null}

            {calculatorType.payout ? (
              <Zone1PayoutTraffic
                expanded={zoneExpanded.zone1b}
                onToggle={() => toggleZone("zone1b")}
                navigation={getZoneNavigation("zone1b")}
                payoutVolume={payoutVolume}
                payoutTransactions={payoutTransactions}
                payout={payout}
                onPayoutVolumeChange={setPayoutVolume}
                onPayoutTransactionsChange={setPayoutTransactions}
              />
            ) : null}

            <Zone2IntroducerCommission
              expanded={zoneExpanded.zone2}
              onToggle={() => toggleZone("zone2")}
              navigation={getZoneNavigation("zone2")}
              showFormulas={showHardcodedConstants}
              introducerEnabled={introducerEnabled}
              onIntroducerEnabledChange={setIntroducerEnabled}
              introducerCommissionType={introducerCommissionType}
              onIntroducerCommissionTypeChange={setIntroducerCommissionType}
              hasPayin={calculatorType.payin}
              payinMonthlyVolume={payin.normalized.monthlyVolume}
              introducerBaseVolume={introducerBaseVolume}
              customTier1UpToMillion={customTier1UpToMillion}
              customTier2UpToMillion={customTier2UpToMillion}
              customTier1RatePerMillion={customTier1RatePerMillion}
              customTier2RatePerMillion={customTier2RatePerMillion}
              customTier3RatePerMillion={customTier3RatePerMillion}
              onCustomTier1UpToChange={handleCustomTier1UpToChange}
              onCustomTier2UpToChange={handleCustomTier2UpToChange}
              onCustomTier1RatePerMillionChange={setCustomTier1RatePerMillion}
              onCustomTier2RatePerMillionChange={setCustomTier2RatePerMillion}
              onCustomTier3RatePerMillionChange={setCustomTier3RatePerMillion}
              revSharePercent={revSharePercent}
              onRevSharePercentChange={handleRevSharePercentChange}
              standardIntroducer={standardIntroducer}
              customIntroducer={customIntroducer}
              revShareIntroducer={revShareIntroducer}
            />

            <Zone3PricingConfiguration
              expanded={zoneExpanded.zone3}
              onToggle={() => toggleZone("zone3")}
              navigation={getZoneNavigation("zone3")}
              settlementIncluded={settlementIncluded}
              setSettlementIncluded={setSettlementIncluded}
              calculatorType={calculatorType}
              payin={payin}
              payout={payout}
              payinEuPricing={payinEuPricing}
              payinWwPricing={payinWwPricing}
              payinEuPreview={payinEuPreview}
              payinWwPreview={payinWwPreview}
              payoutPricing={payoutPricing}
              payoutPreview={payoutPreview}
              payoutRateMinimumAdjustments={payoutRateMinimumAdjustments}
              payoutSingleRateMinimumAdjustment={payoutSingleRateMinimumAdjustment}
              showZone3Formulas={showHardcodedConstants && showZone3Formulas}
              setPayinRegionModel={setPayinRegionModel}
              setPayinRegionRateMode={setPayinRegionRateMode}
              setPayinRegionTrxEnabled={setPayinRegionTrxEnabled}
              setPayinRegionSingleField={setPayinRegionSingleField}
              setPayinRegionTierField={setPayinRegionTierField}
              setPayinRegionTierBoundary={setPayinRegionTierBoundary}
              setPayoutRateMode={setPayoutRateMode}
              setPayoutSingleField={setPayoutSingleField}
              setPayoutTierField={setPayoutTierField}
              setPayoutTierBoundary={setPayoutTierBoundary}
            />

            <Zone4OtherFeesAndLimits
              expanded={zoneExpanded.zone4}
              onToggle={() => toggleZone("zone4")}
              navigation={getZoneNavigation("zone4")}
              calculatorType={calculatorType}
              payin={payin}
              payout={payout}
              payoutMinimumFeeEnabled={payoutMinimumFeeEnabled}
              setPayoutMinimumFeeEnabled={setPayoutMinimumFeeEnabled}
              payoutMinimumFeePerTransaction={payoutMinimumFeePerTransaction}
              setPayoutMinimumFeePerTransaction={setPayoutMinimumFeePerTransaction}
              threeDsEnabled={threeDsEnabled}
              setThreeDsEnabled={setThreeDsEnabled}
              threeDsRevenuePerSuccessfulTransaction={threeDsRevenuePerSuccessfulTransaction}
              setThreeDsRevenuePerSuccessfulTransaction={setThreeDsRevenuePerSuccessfulTransaction}
              settlementIncluded={settlementIncluded}
              settlementFeeEnabled={settlementFeeEnabled}
              setSettlementFeeEnabled={setSettlementFeeEnabled}
              settlementFeeRatePercent={settlementFeeRatePercent}
              setSettlementFeeRatePercent={setSettlementFeeRatePercent}
              monthlyMinimumFeeEnabled={monthlyMinimumFeeEnabled}
              setMonthlyMinimumFeeEnabled={setMonthlyMinimumFeeEnabled}
              monthlyMinimumFeeAmount={monthlyMinimumFeeAmount}
              setMonthlyMinimumFeeAmount={setMonthlyMinimumFeeAmount}
              failedTrxEnabled={failedTrxEnabled}
              setFailedTrxEnabled={setFailedTrxEnabled}
              failedTrxMode={failedTrxMode}
              setFailedTrxMode={setFailedTrxMode}
              failedTrxOverLimitThresholdPercent={failedTrxOverLimitThresholdPercent}
              setFailedTrxOverLimitThresholdPercent={setFailedTrxOverLimitThresholdPercent}
              showZone4Formulas={showHardcodedConstants && showZone4Formulas}
              payoutMinimumFeeImpact={payoutMinimumFeeImpact}
              threeDsImpact={threeDsImpact}
              settlementFeeImpact={settlementFeeImpact}
              monthlyMinimumFeeImpact={monthlyMinimumFeeImpact}
              failedTrxImpact={failedTrxImpact}
              effectiveFailedTrxFees={effectiveFailedTrxFees}
              payinBaseRevenue={payinBaseRevenue}
              payoutRevenueAdjusted={payoutRevenueAdjusted}
              contractSummarySettings={contractSummarySettings}
              setContractSummaryField={setContractSummaryField}
            />

            <Zone5ProfitabilityCalculations
              expanded={zoneExpanded.zone5}
              onToggle={() => toggleZone("zone5")}
              navigation={getZoneNavigation("zone5")}
              showUnifiedFormulas={showUnifiedFormulas}
              onShowUnifiedFormulasChange={setShowUnifiedFormulas}
              onExpandAllRows={expandAllUnifiedRows}
              onCollapseAllRows={collapseAllUnifiedRows}
              unifiedProfitabilityTree={unifiedProfitabilityTree}
              unifiedExpandedById={unifiedExpandedById}
              onToggleUnifiedRow={toggleUnifiedRow}
              payoutMinimumFeeWarning={payoutMinimumFeeImpact.warning}
              payoutPerTransactionRevenue={payoutMinimumFeeImpact.perTransactionRevenue}
              payoutAppliedPerTransactionRevenue={payoutMinimumFeeImpact.appliedPerTransactionRevenue}
              payoutBaseRevenue={payoutMinimumFeeImpact.baseRevenue}
              payoutAdjustedRevenue={payoutMinimumFeeImpact.adjustedRevenue}
              payoutMinimumFeePerTransaction={payoutMinimumFeePerTransaction}
              monthlyMinimumWarning={monthlyMinimumFeeImpact.warning}
              monthlyMinimumBaseRevenue={monthlyMinimumFeeImpact.baseRevenue}
              monthlyMinimumAppliedRevenue={monthlyMinimumFeeImpact.appliedRevenue}
              monthlyMinimumFeeAmount={monthlyMinimumFeeAmount}
              monthlyMinimumUpliftRevenue={monthlyMinimumFeeImpact.upliftRevenue}
              payoutRateMinimumAdjustments={payoutRateMinimumAdjustments}
            />

            <Zone6OfferSummary
              expanded={zoneExpanded.zone6}
              onToggle={() => toggleZone("zone6")}
              navigation={getZoneNavigation("zone6")}
              clientNotes={clientNotes}
              onClientNotesChange={setClientNotes}
              offerSummaryText={offerSummaryText}
              offerSummaryActionMessage={offerSummaryActionMessage}
              onCopy={handleCopyOfferSummary}
              onExportPdf={handleExportOfferSummaryPdf}
              onPrint={handlePrintOfferSummary}
              onOpenWizard={handleOpenWizardWorkspace}
            />
          </>
        ) : (
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
            onGeneratePdf={handleWizardGeneratePdf}
            onRefreshFromCalculator={handleWizardRefillFromCalculator}
            actionMessage={wizardActionMessage}
          />
        )}

      </div>
    </main>
  );
}
