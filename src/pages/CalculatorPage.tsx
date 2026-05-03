import { useNavigate } from "react-router-dom";
import { useEffect, useMemo } from "react";
import { buildOfferSummaryText } from "../domain/calculator/index.js";
import {
  CalculatorActionsPanel,
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
} from "../components/calculator/index.js";
import { useCalculator } from "../contexts/CalculatorContext.js";

export function CalculatorPage() {
  const navigate = useNavigate();
  const calc = useCalculator();

  const offerSummaryText = useMemo(
    () =>
      buildOfferSummaryText({
        generatedAt: new Date(),
        clientNotes: calc.clientNotes,
        calculatorType: calc.calculatorType,
        payin: calc.payin,
        payout: calc.payout,
        settlementIncluded: calc.settlementIncluded,
        payinEuPricing: calc.payinEuPricing,
        payinWwPricing: calc.payinWwPricing,
        payoutPricing: calc.payoutPricing,
        payoutMinimumFeeEnabled: calc.payoutMinimumFeeEnabled,
        payoutMinimumFeePerTransaction: calc.payoutMinimumFeePerTransaction,
        threeDsEnabled: calc.threeDsEnabled,
        threeDsRevenuePerSuccessfulTransaction: calc.threeDsRevenuePerSuccessfulTransaction,
        settlementFeeEnabled: calc.settlementFeeEnabled,
        settlementFeeRatePercent: calc.settlementFeeRatePercent,
        monthlyMinimumFeeEnabled: calc.monthlyMinimumFeeEnabled,
        monthlyMinimumFeeAmount: calc.monthlyMinimumFeeAmount,
        failedTrxEnabled: calc.failedTrxEnabled,
        failedTrxMode: calc.failedTrxMode,
        failedTrxOverLimitThresholdPercent: calc.failedTrxOverLimitThresholdPercent,
        contractSummary: calc.contractSummarySettings,
        introducerEnabled: calc.introducerEnabled,
        introducerCommissionType: calc.introducerCommissionType,
        standardIntroducer: calc.standardIntroducer,
        customIntroducer: calc.customIntroducer,
        revShareIntroducer: calc.revShareIntroducer
      }),
    [
      calc.calculatorType,
      calc.clientNotes,
      calc.contractSummarySettings,
      calc.customIntroducer,
      calc.failedTrxEnabled,
      calc.failedTrxMode,
      calc.failedTrxOverLimitThresholdPercent,
      calc.introducerEnabled,
      calc.introducerCommissionType,
      calc.monthlyMinimumFeeAmount,
      calc.monthlyMinimumFeeEnabled,
      calc.payin,
      calc.payinEuPricing,
      calc.payinWwPricing,
      calc.payout,
      calc.payoutMinimumFeeEnabled,
      calc.payoutMinimumFeePerTransaction,
      calc.payoutPricing,
      calc.revShareIntroducer,
      calc.settlementFeeEnabled,
      calc.settlementFeeRatePercent,
      calc.settlementIncluded,
      calc.standardIntroducer,
      calc.threeDsEnabled,
      calc.threeDsRevenuePerSuccessfulTransaction
    ]
  );

  useEffect(() => {
    calc.setOfferSummaryActionMessage(null);
  }, [offerSummaryText, calc.setOfferSummaryActionMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopyOfferSummary = async () => {
    try {
      if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(offerSummaryText);
      calc.setOfferSummaryActionMessage("Summary copied to clipboard.");
    } catch {
      calc.setOfferSummaryActionMessage(
        "Clipboard access is blocked. Copy the text manually from preview."
      );
    }
  };

  const openOfferSummaryPrintView = (mode: "pdf" | "print") => {
    if (typeof window === "undefined") return;

    const popup = window.open("", "_blank", "noopener,noreferrer,width=980,height=760");
    if (!popup) {
      calc.setOfferSummaryActionMessage(
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

    calc.setOfferSummaryActionMessage(
      mode === "pdf" ? 'Print dialog opened. Choose "Save as PDF" to export.' : "Print dialog opened."
    );
  };

  return (
    <>
      <HardcodedConstantsPanel
        visible={calc.showHardcodedConstants}
        groups={calc.hardcodedConstantGroups}
      />
      <CalculatorActionsPanel
        showHardcodedConstants={calc.showHardcodedConstants}
        onToggleConstantsAndFormulas={calc.toggleHardcodedConstantsAndZoneFormulas}
        onReset={calc.resetAllValuesToZero}
        onApplyDefaults={calc.applyDefaultValues}
      />

      <Zone0CalculatorType
        expanded={calc.zoneExpanded.zone0}
        onToggle={() => calc.toggleZone("zone0")}
        calculatorType={calc.calculatorType}
        onPayinEnabledChange={calc.setPayinEnabled}
        onPayoutEnabledChange={calc.setPayoutEnabled}
      />

      {calc.calculatorType.payin ? (
        <Zone1PayinTraffic
          expanded={calc.zoneExpanded.zone1a}
          onToggle={() => calc.toggleZone("zone1a")}
          navigation={calc.getZoneNavigation("zone1a")}
          payinVolume={calc.payinVolume}
          payinTransactions={calc.payinTransactions}
          approvalRatioPercent={calc.approvalRatioPercent}
          euPercent={calc.euPercent}
          wwPercent={calc.wwPercent}
          ccPercent={calc.ccPercent}
          apmPercent={calc.apmPercent}
          payin={calc.payin}
          onPayinVolumeChange={calc.setPayinVolume}
          onPayinTransactionsChange={calc.setPayinTransactions}
          onApprovalRatioPercentChange={calc.setApprovalRatioPercent}
          onEuPercentChange={calc.handleEuChange}
          onWwPercentChange={calc.handleWwChange}
          onCcPercentChange={calc.handleCcChange}
          onApmPercentChange={calc.handleApmChange}
        />
      ) : null}

      {calc.calculatorType.payout ? (
        <Zone1PayoutTraffic
          expanded={calc.zoneExpanded.zone1b}
          onToggle={() => calc.toggleZone("zone1b")}
          navigation={calc.getZoneNavigation("zone1b")}
          payoutVolume={calc.payoutVolume}
          payoutTransactions={calc.payoutTransactions}
          payout={calc.payout}
          onPayoutVolumeChange={calc.setPayoutVolume}
          onPayoutTransactionsChange={calc.setPayoutTransactions}
        />
      ) : null}

      <Zone2IntroducerCommission
        expanded={calc.zoneExpanded.zone2}
        onToggle={() => calc.toggleZone("zone2")}
        navigation={calc.getZoneNavigation("zone2")}
        showFormulas={calc.showHardcodedConstants}
        introducerEnabled={calc.introducerEnabled}
        onIntroducerEnabledChange={calc.setIntroducerEnabled}
        introducerCommissionType={calc.introducerCommissionType}
        onIntroducerCommissionTypeChange={calc.setIntroducerCommissionType}
        hasPayin={calc.calculatorType.payin}
        payinMonthlyVolume={calc.payin.normalized.monthlyVolume}
        introducerBaseVolume={calc.introducerBaseVolume}
        customTier1UpToMillion={calc.customTier1UpToMillion}
        customTier2UpToMillion={calc.customTier2UpToMillion}
        customTier1RatePerMillion={calc.customTier1RatePerMillion}
        customTier2RatePerMillion={calc.customTier2RatePerMillion}
        customTier3RatePerMillion={calc.customTier3RatePerMillion}
        onCustomTier1UpToChange={calc.handleCustomTier1UpToChange}
        onCustomTier2UpToChange={calc.handleCustomTier2UpToChange}
        onCustomTier1RatePerMillionChange={calc.setCustomTier1RatePerMillion}
        onCustomTier2RatePerMillionChange={calc.setCustomTier2RatePerMillion}
        onCustomTier3RatePerMillionChange={calc.setCustomTier3RatePerMillion}
        revSharePercent={calc.revSharePercent}
        onRevSharePercentChange={calc.handleRevSharePercentChange}
        standardIntroducer={calc.standardIntroducer}
        customIntroducer={calc.customIntroducer}
        revShareIntroducer={calc.revShareIntroducer}
      />

      <Zone3PricingConfiguration
        expanded={calc.zoneExpanded.zone3}
        onToggle={() => calc.toggleZone("zone3")}
        navigation={calc.getZoneNavigation("zone3")}
        settlementIncluded={calc.settlementIncluded}
        setSettlementIncluded={calc.setSettlementIncluded}
        calculatorType={calc.calculatorType}
        payin={calc.payin}
        payout={calc.payout}
        payinEuPricing={calc.payinEuPricing}
        payinWwPricing={calc.payinWwPricing}
        payinEuPreview={calc.payinEuPreview}
        payinWwPreview={calc.payinWwPreview}
        payoutPricing={calc.payoutPricing}
        payoutPreview={calc.payoutPreview}
        payoutRateMinimumAdjustments={calc.payoutRateMinimumAdjustments}
        payoutSingleRateMinimumAdjustment={calc.payoutSingleRateMinimumAdjustment}
        showZone3Formulas={calc.showHardcodedConstants && calc.showZone3Formulas}
        setPayinRegionModel={calc.setPayinRegionModel}
        setPayinRegionRateMode={calc.setPayinRegionRateMode}
        setPayinRegionTrxEnabled={calc.setPayinRegionTrxEnabled}
        setPayinRegionSingleField={calc.setPayinRegionSingleField}
        setPayinRegionTierField={calc.setPayinRegionTierField}
        setPayinRegionTierBoundary={calc.setPayinRegionTierBoundary}
        setPayoutRateMode={calc.setPayoutRateMode}
        setPayoutSingleField={calc.setPayoutSingleField}
        setPayoutTierField={calc.setPayoutTierField}
        setPayoutTierBoundary={calc.setPayoutTierBoundary}
      />

      <Zone4OtherFeesAndLimits
        expanded={calc.zoneExpanded.zone4}
        onToggle={() => calc.toggleZone("zone4")}
        navigation={calc.getZoneNavigation("zone4")}
        calculatorType={calc.calculatorType}
        payin={calc.payin}
        payout={calc.payout}
        payoutMinimumFeeEnabled={calc.payoutMinimumFeeEnabled}
        setPayoutMinimumFeeEnabled={calc.setPayoutMinimumFeeEnabled}
        payoutMinimumFeePerTransaction={calc.payoutMinimumFeePerTransaction}
        setPayoutMinimumFeePerTransaction={calc.setPayoutMinimumFeePerTransaction}
        threeDsEnabled={calc.threeDsEnabled}
        setThreeDsEnabled={calc.setThreeDsEnabled}
        threeDsRevenuePerSuccessfulTransaction={calc.threeDsRevenuePerSuccessfulTransaction}
        setThreeDsRevenuePerSuccessfulTransaction={calc.setThreeDsRevenuePerSuccessfulTransaction}
        settlementIncluded={calc.settlementIncluded}
        settlementFeeEnabled={calc.settlementFeeEnabled}
        setSettlementFeeEnabled={calc.setSettlementFeeEnabled}
        settlementFeeRatePercent={calc.settlementFeeRatePercent}
        setSettlementFeeRatePercent={calc.setSettlementFeeRatePercent}
        monthlyMinimumFeeEnabled={calc.monthlyMinimumFeeEnabled}
        setMonthlyMinimumFeeEnabled={calc.setMonthlyMinimumFeeEnabled}
        monthlyMinimumFeeAmount={calc.monthlyMinimumFeeAmount}
        setMonthlyMinimumFeeAmount={calc.setMonthlyMinimumFeeAmount}
        failedTrxEnabled={calc.failedTrxEnabled}
        setFailedTrxEnabled={calc.setFailedTrxEnabled}
        failedTrxMode={calc.failedTrxMode}
        setFailedTrxMode={calc.setFailedTrxMode}
        failedTrxOverLimitThresholdPercent={calc.failedTrxOverLimitThresholdPercent}
        setFailedTrxOverLimitThresholdPercent={calc.setFailedTrxOverLimitThresholdPercent}
        showZone4Formulas={calc.showHardcodedConstants && calc.showZone4Formulas}
        payoutMinimumFeeImpact={calc.payoutMinimumFeeImpact}
        threeDsImpact={calc.threeDsImpact}
        settlementFeeImpact={calc.settlementFeeImpact}
        monthlyMinimumFeeImpact={calc.monthlyMinimumFeeImpact}
        failedTrxImpact={calc.failedTrxImpact}
        effectiveFailedTrxFees={calc.effectiveFailedTrxFees}
        payinBaseRevenue={calc.payinBaseRevenue}
        payoutRevenueAdjusted={calc.payoutRevenueAdjusted}
        contractSummarySettings={calc.contractSummarySettings}
        setContractSummaryField={calc.setContractSummaryField}
      />

      <Zone5ProfitabilityCalculations
        expanded={calc.zoneExpanded.zone5}
        onToggle={() => calc.toggleZone("zone5")}
        navigation={calc.getZoneNavigation("zone5")}
        showUnifiedFormulas={calc.showUnifiedFormulas}
        onShowUnifiedFormulasChange={calc.setShowUnifiedFormulas}
        onExpandAllRows={calc.expandAllUnifiedRows}
        onCollapseAllRows={calc.collapseAllUnifiedRows}
        unifiedProfitabilityTree={calc.unifiedProfitabilityTree}
        unifiedExpandedById={calc.unifiedExpandedById}
        onToggleUnifiedRow={calc.toggleUnifiedRow}
        payoutMinimumFeeWarning={calc.payoutMinimumFeeImpact.warning}
        payoutPerTransactionRevenue={calc.payoutMinimumFeeImpact.perTransactionRevenue}
        payoutAppliedPerTransactionRevenue={calc.payoutMinimumFeeImpact.appliedPerTransactionRevenue}
        payoutBaseRevenue={calc.payoutMinimumFeeImpact.baseRevenue}
        payoutAdjustedRevenue={calc.payoutMinimumFeeImpact.adjustedRevenue}
        payoutMinimumFeePerTransaction={calc.payoutMinimumFeePerTransaction}
        monthlyMinimumWarning={calc.monthlyMinimumFeeImpact.warning}
        monthlyMinimumBaseRevenue={calc.monthlyMinimumFeeImpact.baseRevenue}
        monthlyMinimumAppliedRevenue={calc.monthlyMinimumFeeImpact.appliedRevenue}
        monthlyMinimumFeeAmount={calc.monthlyMinimumFeeAmount}
        monthlyMinimumUpliftRevenue={calc.monthlyMinimumFeeImpact.upliftRevenue}
        payoutRateMinimumAdjustments={calc.payoutRateMinimumAdjustments}
      />

      <Zone6OfferSummary
        expanded={calc.zoneExpanded.zone6}
        onToggle={() => calc.toggleZone("zone6")}
        navigation={calc.getZoneNavigation("zone6")}
        clientNotes={calc.clientNotes}
        onClientNotesChange={calc.setClientNotes}
        offerSummaryText={offerSummaryText}
        offerSummaryActionMessage={calc.offerSummaryActionMessage}
        onCopy={handleCopyOfferSummary}
        onExportPdf={() => openOfferSummaryPrintView("pdf")}
        onPrint={() => openOfferSummaryPrintView("print")}
        onOpenWizard={() => navigate("/wizard")}
      />
    </>
  );
}
