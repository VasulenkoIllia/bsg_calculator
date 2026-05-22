import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../contexts/AuthContext.js";
import * as configsApi from "../api/calculator-configs.js";
import { ApiError } from "../api/client.js";
import { buildOfferSummaryText } from "../domain/calculator/index.js";
import {
  HardcodedConstantsPanel,
  Zone0CalculatorType,
  Zone1PayinTraffic,
  Zone1PayoutTraffic,
  Zone2IntroducerCommission,
  Zone3PricingConfiguration,
  Zone4OtherFeesAndLimits,
  Zone5ProfitabilityCalculations,
  Zone6OfferSummary
} from "../components/calculator/index.js";
import {
  extractCalculatorSnapshot,
  isCalculatorSnapshotPayload,
  seedCalculatorStateFromSnapshot
} from "../components/calculator/snapshotShape.js";
import { CalculatorStickyToolbar } from "../components/calculator/CalculatorStickyToolbar.js";
import { EventHistoryPanel } from "../components/EventHistoryPanel.js";
import { SaveCalculatorModal } from "../components/SaveCalculatorModal.js";
import {
  BannerStatus,
  DocumentsFromCalcSection,
  SavedStatusBadge
} from "../components/calculator/edit-mode/index.js";
import { useCalculator } from "../contexts/CalculatorContext.js";
import { useToast } from "../contexts/ToastContext.js";
import { useDebouncedValue } from "../hooks/useDebouncedValue.js";
import {
  useCalculatorConfig,
  useUpdateCalculatorConfig
} from "../hooks/useCalculatorConfig.js";
import { useDocuments } from "../hooks/useDocuments.js";
// formatters moved with edit-mode components — see
// src/components/calculator/edit-mode/SavedStatusBadge.tsx +
// DocumentsFromCalcSection.tsx

export function CalculatorPage() {
  const navigate = useNavigate();
  const calc = useCalculator();

  // Sprint 6.1: when the route is `/calc/:id`, this page operates in
  // "edit existing saved config" mode — load the persisted payload,
  // hydrate the live calculator state, and auto-save on debounced
  // changes. When `:id` is absent (route `/calculator`), the page
  // is a fresh draft and the legacy "Save calculator" modal flow
  // (POST /calculator-configs) governs.
  const { id: configId } = useParams<{ id: string }>();
  const isEditMode = typeof configId === "string" && configId.length > 0;
  const configQuery = useCalculatorConfig(configId);
  // Phase 8 Stage 4 — calc-config events for the History panel
  // (only meaningful in edit mode — no row exists yet otherwise).
  const eventsQuery = useQuery({
    queryKey: ["calc-config-events", configId],
    queryFn: () => configsApi.listCalculatorConfigEvents(configId!),
    enabled: isEditMode,
    staleTime: 15_000
  });

  // ─── Hydrate live state from the loaded payload (once per id) ────
  // We track which id we've hydrated so re-renders or the auto-save
  // mutation echoing back the row don't re-apply the preset (which
  // would clobber unsaved live edits the user just made).
  //
  // INFINITE-LOOP NOTE: `useCalculator()` returns a fresh context
  // value every render (the provider doesn't memoise it), so
  // including `calc` directly in the effect's dep array would
  // re-fire the effect every render and — combined with the
  // hydration ref guard — wouldn't actually loop the body but
  // would still produce spurious effect runs. We pin `applyStatePreset`
  // to a ref and exclude `calc` from deps.
  const hydratedFromIdRef = useRef<string | null>(null);
  const applyStatePresetRef = useRef(calc.applyStatePreset);
  applyStatePresetRef.current = calc.applyStatePreset;
  useEffect(() => {
    if (!isEditMode) return;
    if (!configQuery.data) return;
    if (hydratedFromIdRef.current === configId) return;
    // Sprint 6.F.3 (audit Q3): runtime-validate the JSONB payload
    // before feeding it to seedCalculatorStateFromSnapshot. Without
    // this guard a shape mismatch (schemaVersion drift, malformed
    // row written by an older client) propagates as undefined
    // fields into the live calculator state — silently. Now the
    // mismatch is caught early and surfaces as a console error +
    // skipped hydration (the auto-save stays disarmed because
    // hydratedFromIdRef never advances).
    const payload = configQuery.data.payload;
    if (!isCalculatorSnapshotPayload(payload)) {
      // eslint-disable-next-line no-console
      console.error(
        "[CalculatorPage] saved payload is not a valid CalculatorSnapshotPayload — skipping hydration",
        { configId, payloadKeys: Object.keys(payload ?? {}) }
      );
      return;
    }
    try {
      const preset = seedCalculatorStateFromSnapshot(payload);
      applyStatePresetRef.current(preset);
      hydratedFromIdRef.current = configId ?? null;
    } catch (err) {
      // A deeper shape mismatch (a nested object the guard didn't
      // probe) can still throw inside seedCalculatorStateFromSnapshot.
      // Caught here and logged; the badge will show "Unsaved" because
      // savedAtIso stays null until a real save lands.
      // eslint-disable-next-line no-console
      console.error("[CalculatorPage] hydrate failed", err);
    }
  }, [configId, configQuery.data, isEditMode]);

  // ─── Auto-save (1s debounce) ─────────────────────────────────────
  // Extract a snapshot from the live state on every render. The
  // snapshot is a fresh object each render (extractCalculatorSnapshot
  // doesn't memoise), so we can't feed it directly to useDebouncedValue
  // — its useState would never settle (every render = new ref =
  // new debounce timer). Instead we debounce a JSON STRING of the
  // snapshot: strings compare by value, so debounced state actually
  // changes only when the underlying data changes.
  const liveSnapshotJson = useMemo(() => {
    if (!isEditMode) return null;
    return JSON.stringify(extractCalculatorSnapshot(calc));
    // We want `liveSnapshotJson` to recompute every render in edit
    // mode (so any calc state change is captured), but we DON'T want
    // useMemo to look at every `calc.*` primitive — that's hundreds
    // of fields. The safe approach: use `calc` in deps despite its
    // reference instability; useMemo always re-runs but the produced
    // STRING is what useDebouncedValue de-dupes against.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, calc]);
  const debouncedSnapshotJson = useDebouncedValue(liveSnapshotJson, 1_000);
  const updateMutation = useUpdateCalculatorConfig(configId);

  // Skip the auto-save for the very first snapshot after hydration
  // (otherwise the freshly-loaded payload triggers a no-op PUT to
  // the same values). We mark hydration "settled" one tick AFTER
  // the hydrate effect runs.
  const autoSaveArmedRef = useRef(false);
  // Sprint 6.F.1 (audit CORRECTNESS): reset the armed flag whenever
  // configId changes. Without this, navigating /calc/A → /calc/B in
  // the same SPA session keeps the flag at `true` from the previous
  // session. The freshly-hydrated payload then immediately triggers
  // an auto-save PUT for B before the operator has changed anything,
  // and any default-filling done by seedCalculatorStateFromSnapshot
  // (e.g. backfilling a field absent from the stored row) would be
  // silently persisted as if the operator had typed it.
  //
  // Sprint 6.9 S4: reset `hydratedFromIdRef` for the SAME reason —
  // navigating /calc/A → /calc/B → /calc/A leaves the ref pointing
  // at "A" from visit #1, so the hydrate effect short-circuits on
  // visit #3 and never re-applies A's persisted payload. Operator
  // sees stale state from CalculatorContext if they edited B in
  // between. Resetting on configId change forces re-hydration on
  // every navigation to a config page.
  useEffect(() => {
    autoSaveArmedRef.current = false;
    hydratedFromIdRef.current = null;
  }, [configId]);
  useEffect(() => {
    if (!isEditMode) return;
    if (hydratedFromIdRef.current !== configId) return;
    // Wait one render after hydrate so the live state has settled.
    const t = setTimeout(() => {
      autoSaveArmedRef.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, [configId, configQuery.data, isEditMode]);

  useEffect(() => {
    if (!isEditMode) return;
    if (!debouncedSnapshotJson) return;
    if (!autoSaveArmedRef.current) return;
    if (updateMutation.isPending) return;
    const parsedSnapshot = JSON.parse(debouncedSnapshotJson) as { schemaVersion: number } &
      Record<string, unknown>;
    // Auto-save sends ONLY the payload — title and hubspotDealId are
    // omitted so the backend's partial-update semantics
    // (Sprint 6.6 bug fix in calculator-configs.service.ts) leave
    // those fields untouched. Earlier the body shape was
    // `{ payload, hubspotDealId?, title? }` and the backend
    // collapsed `undefined` → `null`, silently erasing the title and
    // deal-pin on every auto-save tick.
    updateMutation.mutate({ payload: parsedSnapshot });
    // mutate() is referentially stable per the TanStack Query docs;
    // we deliberately leave it out of the dep array so a rapid retry
    // doesn't re-fire on the same snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSnapshotJson, isEditMode]);

  // Status for the "Saved · 2s ago" indicator. Derived (not state)
  // so we avoid the Date-object trap: storing `new Date(updatedAt)`
  // in useState + writing it via setSavedAt on every render of the
  // savedAt effect produced a new Date reference each time, which
  // failed the Object.is bail-out in setState and caused
  // "Maximum update depth exceeded". By deriving directly from the
  // (stable) underlying updatedAt string we sidestep both the
  // state-storage and the effect entirely.
  const savedAtIso =
    updateMutation.data?.updatedAt ?? configQuery.data?.updatedAt ?? null;

  // Sprint 6.4: "Documents from this calculator" history. Filters
  // the documents listing by `calculatorConfigId` so the operator
  // sees every BSG-XXXXX that was saved from this exact calc draft.
  // Only fires in edit mode (configId resolved) — the new-draft
  // calculator has no id to filter on.
  const docsFromCalc = useDocuments({
    calculatorConfigId: isEditMode ? configId : undefined,
    enabled: isEditMode
  });

  // Save modal — gathers (company, optional deal, optional title) and
  // POSTs the snapshot to /api/v1/calculator-configs. Sprint 3.B.
  // Sprint 6.1: only mounted in NEW-draft mode (no `:id`); when
  // editing a saved config the auto-save above governs persistence.
  const [saveOpen, setSaveOpen] = useState(false);

  // Sprint 6.3: global toasts replace the per-page inline savedToast
  // state. The "Calculator saved" feedback now flows through the
  // shared ToastProvider so it's consistent with every other
  // mutation success message.
  const toast = useToast();

  // Phase 9.I — manual HubSpot sync for the calc-config. Visible
  // only in edit mode for admin/super_admin operators (mirror of
  // the documents Sync button). Auto-save (PUT) does NOT trigger
  // sync per operator brief; this button is the only path that
  // creates a fresh Note in HubSpot for the calc.
  const { hasRole } = useAuth();
  const queryClient = useQueryClient();
  const [calcSyncPending, setCalcSyncPending] = useState(false);

  async function handleSyncCalcToHubspot(): Promise<void> {
    if (!configId) return;
    setCalcSyncPending(true);
    try {
      const updated = await configsApi.syncCalculatorConfigToHubspot(configId);
      // Optimistic single-config cache update + invalidate listings
      // so the "Saved calculators" pages re-render with the new
      // sync state.
      queryClient.setQueryData(["calculator-configs", "get", configId], updated);
      queryClient.invalidateQueries({ queryKey: ["calculator-configs"] });
      toast.success("Calculator synced to HubSpot.");
    } catch (err) {
      queryClient.invalidateQueries({ queryKey: ["calculator-configs"] });
      toast.error(
        err instanceof ApiError
          ? `Sync failed: ${err.message}`
          : "Sync failed — try again."
      );
    } finally {
      setCalcSyncPending(false);
    }
  }

  // Capture the snapshot LAZILY when the modal opens — extracting on
  // every render would clone the whole calculator state needlessly.
  // We pass a stable reference into the modal; the modal owns its
  // own form state until "Save".
  const snapshot = useMemo(
    () => (saveOpen ? extractCalculatorSnapshot(calc) : null),
    // calc is stable across renders for our purposes — re-extracting
    // when saveOpen flips is enough.
    [saveOpen, calc]
  );

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

  // Note: the "Export to PDF" / "Print" inline iframe-print path was
  // removed from Zone 6 Export Actions on 2026-05-17 — Sprint 4
  // (Documents + PDF render) will replace it with a backend-driven
  // Puppeteer pipeline. The Offer Summary Preview textarea remains
  // available below for manual copy/paste in the meantime.

  // Edit-mode UX: loading / not-found / errored states surface as a
  // banner above the calculator so the operator immediately sees
  // what's happening. The calculator itself still renders so the
  // user can keep working — we just inform them their changes
  // aren't being persisted yet.
  const editModeBanner = (() => {
    if (!isEditMode) return null;
    if (configQuery.isLoading) {
      return (
        <BannerStatus
          tone="info"
          text="Loading saved calculator config…"
        />
      );
    }
    if (configQuery.isError) {
      const status = configQuery.error?.status;
      if (status === 404) {
        // Sprint 6.F.1 (audit U1): replaced "Calculator config <uuid>
        // not found" with a UUID-free, operator-actionable message.
        // The raw UUID was not useful (you can't paste it anywhere to
        // recover), and surfaces internal identifiers in the UI.
        return (
          <BannerStatus
            tone="error"
            text="Saved calculator not found — this link may be outdated. Auto-save is disabled."
          />
        );
      }
      return (
        <BannerStatus
          tone="error"
          text={configQuery.error?.message ?? "Failed to load saved calculator."}
        />
      );
    }
    return null;
  })();

  // Sprint 6.8: sticky-bar handlers MIRROR Zone 6's Export Actions so
  // the two buttons stay in lockstep. Keeping these closures local
  // (not extracted to a useMemo) — the cost is negligible and the
  // call sites read cleanly.
  const handleOpenWizardFromToolbar = () =>
    navigate(isEditMode ? `/wizard?calc=${configId}` : "/wizard");
  const handleSaveFromToolbar = isEditMode ? undefined : () => setSaveOpen(true);
  // The toolbar's draft-title chip surfaces the saved config's title
  // in edit mode, or null in new-draft mode (no name yet — chip
  // hidden entirely).
  const toolbarDraftTitle = isEditMode
    ? (configQuery.data?.title ?? "(untitled)")
    : null;

  return (
    <>
      {/*
        Sprint 6.8 sticky toolbar: pins Open Contract Wizard + Save
        calculator (new-draft mode only) to the top of the viewport so
        the operator can jump to the wizard without scrolling through
        all six zones. Renders FIRST so it sits above editModeBanner,
        SavedStatusBadge, and the zone panels.
      */}
      {/* Sprint 9.R — `user` is read-only on calc-configs. The
          backend's POST /calculator-configs is admin-gated; we
          mirror that gate here by withholding the save handler
          (CalculatorStickyToolbar hides the button when the prop
          is undefined). */}
      <CalculatorStickyToolbar
        draftTitle={toolbarDraftTitle}
        onOpenWizard={handleOpenWizardFromToolbar}
        onSaveCalculator={hasRole("admin") ? handleSaveFromToolbar : undefined}
        showHardcodedConstants={calc.showHardcodedConstants}
        onToggleConstantsAndFormulas={calc.toggleHardcodedConstantsAndZoneFormulas}
        onReset={calc.resetAllValuesToZero}
        onApplyDefaults={calc.applyDefaultValues}
        // Phase 9.I — HubSpot sync controls. Only render in edit
        // mode (we need a calc id) AND only for admins (the BE
        // route is admin-gated; hiding here matches the
        // hasRole('admin') gate on /documents/:number).
        hubspotSyncState={
          isEditMode ? configQuery.data?.hubspotSyncState : undefined
        }
        onSyncToHubspot={
          isEditMode && hasRole("admin") && configId
            ? handleSyncCalcToHubspot
            : undefined
        }
        syncPending={calcSyncPending}
      />

      {editModeBanner}

      {isEditMode && configQuery.data ? (
        <SavedStatusBadge
          configTitle={configQuery.data.title ?? "(untitled)"}
          isPending={updateMutation.isPending}
          isError={updateMutation.isError}
          errorMessage={updateMutation.error?.message}
          savedAtIso={savedAtIso}
        />
      ) : null}

      {isEditMode && docsFromCalc.items.length > 0 ? (
        <DocumentsFromCalcSection docs={docsFromCalc.items} />
      ) : null}

      {/* Phase 8 Stage 4 — calc-config history. Edit-mode only; the
          new-draft mode has nothing to track yet. */}
      {isEditMode ? (
        <EventHistoryPanel
          events={eventsQuery.data?.items ?? []}
          isLoading={eventsQuery.isLoading}
          isError={eventsQuery.isError}
        />
      ) : null}

      <HardcodedConstantsPanel
        visible={calc.showHardcodedConstants}
        groups={calc.hardcodedConstantGroups}
      />
      {/* Sprint 7.2: CalculatorActionsPanel (Show formulas / Reset 0
          / Apply defaults) moved INTO the sticky toolbar above, next
          to Open Contract Wizard. The standalone panel used to live
          here. */}

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
        setPayinRegionDedicatedCountriesField={calc.setPayinRegionDedicatedCountriesField}
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
        // Sprint 6.2-FIX: when editing a saved calc, the wizard needs
        // to know which config the resulting document derives from so
        // documents.calculator_config_id can be set (FK link). Pass
        // the configId as a query param. In new-draft mode there's no
        // configId yet — the wizard's existing "Source: Calculator"
        // mode reads the live state from CalculatorContext, which is
        // what we want for the unsaved-calc → wizard flow.
        onOpenWizard={() =>
          navigate(isEditMode ? `/wizard?calc=${configId}` : "/wizard")
        }
        // In edit mode auto-save replaces the explicit modal flow —
        // the "Save calculator" button is hidden and a "Saved · 2s ago"
        // badge at the top of the page communicates state instead.
        // Sprint 9.R — additionally hidden for read-only `user`s.
        onSaveCalculator={
          isEditMode || !hasRole("admin") ? undefined : () => setSaveOpen(true)
        }
      />

      {!isEditMode && snapshot ? (
        <SaveCalculatorModal
          open={saveOpen}
          onClose={() => setSaveOpen(false)}
          payload={snapshot as unknown as { schemaVersion: number } & Record<string, unknown>}
          onSaved={createdId => {
            toast.success("Calculator saved.");
            // Sprint 6.1: navigate to the new /calc/:id so subsequent
            // edits go through the auto-save loop instead of opening
            // the modal again.
            navigate(`/calc/${createdId}`, { replace: true });
          }}
        />
      ) : null}
    </>
  );
}

// Edit-mode UX subcomponents (BannerStatus, SavedStatusBadge,
// DocumentsFromCalcSection) live under
// src/components/calculator/edit-mode/ since Sprint 6.F.2 — see
// barrel index there. The split keeps this page file under ~550 LOC.
