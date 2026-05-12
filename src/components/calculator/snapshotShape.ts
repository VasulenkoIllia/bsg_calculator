// Snapshot shape — the business slice of `useCalculatorState` that
// becomes `calculator_snapshots.payload` in the Phase 8 backend.
//
// The live `useCalculatorState` hook mixes (a) business-fact inputs
// (Zones 0–6, the things that actually drive the math) with (b) UI-only
// state (zone expansion, formula visibility toggles, the transient
// "saved!" action message). Backend persistence cares only about (a) —
// the UI state is recreated fresh on every session.
//
// This module is the single source of truth for that boundary:
//
//   - `CalculatorSnapshotPayload` — the persisted shape (Zod / DB types
//     mirror this exactly).
//   - `extractCalculatorSnapshot(state)` — pulls the persisted slice
//     out of the live hook return. Backend `POST /calculator-snapshots`
//     bodies call this on the frontend before sending.
//   - `seedCalculatorStateFromSnapshot(snapshot)` — inverse, takes a
//     persisted snapshot and returns a `CalculatorStatePreset` that
//     `applyStatePreset` accepts (so a view-mode page or a
//     clone-as-new-draft flow can hydrate a hook from a server blob).
//
// IMPORTANT: keep this file free of React imports — it must remain
// callable from Node-side tooling (Zod schema codegen, seed data
// scripts, future server-side derived-summary rebuilders).

import type {
  CalculatorTypeSelection,
  ContractSummarySettings,
  FailedTrxChargingMode,
  IntroducerCommissionType,
  PayinRegionPricingConfig,
  PayoutPricingConfig
} from "../../domain/calculator/index.js";
import {
  cloneContractSummarySettings,
  clonePayinRegionPricingConfig,
  clonePayoutPricingConfig,
  DEFAULT_CALCULATOR_STATE,
  INITIAL_ZONE_EXPANDED,
  type CalculatorStatePreset
} from "./statePresets.js";

// All fields below are part of the persisted snapshot. Anything not
// listed here is UI-only and lives outside this contract:
//   - showHardcodedConstants, showZone3Formulas, showZone4Formulas
//   - showUnifiedFormulas, unifiedExpandedById, zoneExpanded
//   - offerSummaryActionMessage
export interface CalculatorSnapshotPayload {
  // Schema version. Phase 8 starts at 1; bumps with breaking schema
  // changes so backend migrations and stored rows stay readable.
  schemaVersion: 1;

  calculatorType: CalculatorTypeSelection;

  // Zone 1 traffic
  payinVolume: number;
  payinTransactions: number;
  approvalRatioPercent: number;
  euPercent: number;
  ccPercent: number;
  payoutVolume: number;
  payoutTransactions: number;

  // Zone 2 introducer commission
  introducerEnabled: boolean;
  introducerCommissionType: IntroducerCommissionType;
  customTier1UpToMillion: number;
  customTier2UpToMillion: number;
  customTier1RatePerMillion: number;
  customTier2RatePerMillion: number;
  customTier3RatePerMillion: number;
  revSharePercent: number;

  // Zone 3 pricing
  settlementIncluded: boolean;
  payinEuPricing: PayinRegionPricingConfig;
  payinWwPricing: PayinRegionPricingConfig;
  payoutPricing: PayoutPricingConfig;

  // Zone 4 fees and limits
  payoutMinimumFeeEnabled: boolean;
  payoutMinimumFeePerTransaction: number;
  threeDsEnabled: boolean;
  threeDsRevenuePerSuccessfulTransaction: number;
  settlementFeeEnabled: boolean;
  settlementFeeRatePercent: number;
  monthlyMinimumFeeEnabled: boolean;
  monthlyMinimumFeeAmount: number;
  failedTrxEnabled: boolean;
  failedTrxMode: FailedTrxChargingMode;
  failedTrxOverLimitThresholdPercent: number;

  // Contract summary inputs (Zone 4 → Zone 6)
  contractSummarySettings: ContractSummarySettings;

  // Zone 6 free-form notes — persisted because they drive offer copy.
  clientNotes: string;
}

// Subset of the live hook return that this function reads. Defined as
// an interface (not `ReturnType<typeof useCalculatorState>`) to avoid
// pulling React types into modules that import this for serialisation.
export interface CalculatorBusinessStateSlice {
  calculatorType: CalculatorTypeSelection;
  payinVolume: number;
  payinTransactions: number;
  approvalRatioPercent: number;
  euPercent: number;
  ccPercent: number;
  payoutVolume: number;
  payoutTransactions: number;
  introducerEnabled: boolean;
  introducerCommissionType: IntroducerCommissionType;
  customTier1UpToMillion: number;
  customTier2UpToMillion: number;
  customTier1RatePerMillion: number;
  customTier2RatePerMillion: number;
  customTier3RatePerMillion: number;
  revSharePercent: number;
  settlementIncluded: boolean;
  payinEuPricing: PayinRegionPricingConfig;
  payinWwPricing: PayinRegionPricingConfig;
  payoutPricing: PayoutPricingConfig;
  payoutMinimumFeeEnabled: boolean;
  payoutMinimumFeePerTransaction: number;
  threeDsEnabled: boolean;
  threeDsRevenuePerSuccessfulTransaction: number;
  settlementFeeEnabled: boolean;
  settlementFeeRatePercent: number;
  monthlyMinimumFeeEnabled: boolean;
  monthlyMinimumFeeAmount: number;
  failedTrxEnabled: boolean;
  failedTrxMode: FailedTrxChargingMode;
  failedTrxOverLimitThresholdPercent: number;
  contractSummarySettings: ContractSummarySettings;
  clientNotes: string;
}

/**
 * Pulls the persisted business slice out of the live calculator hook.
 * Every nested object is deep-cloned so the resulting payload is safe
 * to JSON.stringify / send to the backend without aliasing the live
 * React state.
 *
 * Backend call site:
 *   const payload = extractCalculatorSnapshot(calc);
 *   await fetch("/api/v1/calculator-snapshots", {
 *     method: "POST",
 *     body: JSON.stringify(payload),
 *   });
 */
export function extractCalculatorSnapshot(
  state: CalculatorBusinessStateSlice
): CalculatorSnapshotPayload {
  return {
    schemaVersion: 1,
    calculatorType: { ...state.calculatorType },
    payinVolume: state.payinVolume,
    payinTransactions: state.payinTransactions,
    approvalRatioPercent: state.approvalRatioPercent,
    euPercent: state.euPercent,
    ccPercent: state.ccPercent,
    payoutVolume: state.payoutVolume,
    payoutTransactions: state.payoutTransactions,
    introducerEnabled: state.introducerEnabled,
    introducerCommissionType: state.introducerCommissionType,
    customTier1UpToMillion: state.customTier1UpToMillion,
    customTier2UpToMillion: state.customTier2UpToMillion,
    customTier1RatePerMillion: state.customTier1RatePerMillion,
    customTier2RatePerMillion: state.customTier2RatePerMillion,
    customTier3RatePerMillion: state.customTier3RatePerMillion,
    revSharePercent: state.revSharePercent,
    settlementIncluded: state.settlementIncluded,
    payinEuPricing: clonePayinRegionPricingConfig(state.payinEuPricing),
    payinWwPricing: clonePayinRegionPricingConfig(state.payinWwPricing),
    payoutPricing: clonePayoutPricingConfig(state.payoutPricing),
    payoutMinimumFeeEnabled: state.payoutMinimumFeeEnabled,
    payoutMinimumFeePerTransaction: state.payoutMinimumFeePerTransaction,
    threeDsEnabled: state.threeDsEnabled,
    threeDsRevenuePerSuccessfulTransaction: state.threeDsRevenuePerSuccessfulTransaction,
    settlementFeeEnabled: state.settlementFeeEnabled,
    settlementFeeRatePercent: state.settlementFeeRatePercent,
    monthlyMinimumFeeEnabled: state.monthlyMinimumFeeEnabled,
    monthlyMinimumFeeAmount: state.monthlyMinimumFeeAmount,
    failedTrxEnabled: state.failedTrxEnabled,
    failedTrxMode: state.failedTrxMode,
    failedTrxOverLimitThresholdPercent: state.failedTrxOverLimitThresholdPercent,
    contractSummarySettings: cloneContractSummarySettings(state.contractSummarySettings),
    clientNotes: state.clientNotes
  };
}

/**
 * Inverse of `extractCalculatorSnapshot`. Takes a persisted snapshot
 * (e.g. fetched from `GET /calculator-snapshots/:id`) and returns a
 * `CalculatorStatePreset` that the live hook accepts via
 * `applyStatePreset`. UI-only state defaults to the same values
 * `DEFAULT_CALCULATOR_STATE` ships with — the snapshot does NOT carry
 * UI state by design.
 *
 * Used by the future view-mode page (loads a snapshot into a read-only
 * calculator) and the clone-as-new-draft flow (seeds a fresh edit
 * session from an existing snapshot).
 */
export function seedCalculatorStateFromSnapshot(
  snapshot: CalculatorSnapshotPayload
): CalculatorStatePreset {
  return {
    calculatorType: { ...snapshot.calculatorType },
    payinVolume: snapshot.payinVolume,
    payinTransactions: snapshot.payinTransactions,
    approvalRatioPercent: snapshot.approvalRatioPercent,
    euPercent: snapshot.euPercent,
    ccPercent: snapshot.ccPercent,
    payoutVolume: snapshot.payoutVolume,
    payoutTransactions: snapshot.payoutTransactions,
    introducerEnabled: snapshot.introducerEnabled,
    introducerCommissionType: snapshot.introducerCommissionType,
    customTier1UpToMillion: snapshot.customTier1UpToMillion,
    customTier2UpToMillion: snapshot.customTier2UpToMillion,
    customTier1RatePerMillion: snapshot.customTier1RatePerMillion,
    customTier2RatePerMillion: snapshot.customTier2RatePerMillion,
    customTier3RatePerMillion: snapshot.customTier3RatePerMillion,
    revSharePercent: snapshot.revSharePercent,
    settlementIncluded: snapshot.settlementIncluded,
    payinEuPricing: clonePayinRegionPricingConfig(snapshot.payinEuPricing),
    payinWwPricing: clonePayinRegionPricingConfig(snapshot.payinWwPricing),
    payoutPricing: clonePayoutPricingConfig(snapshot.payoutPricing),
    payoutMinimumFeeEnabled: snapshot.payoutMinimumFeeEnabled,
    payoutMinimumFeePerTransaction: snapshot.payoutMinimumFeePerTransaction,
    threeDsEnabled: snapshot.threeDsEnabled,
    threeDsRevenuePerSuccessfulTransaction: snapshot.threeDsRevenuePerSuccessfulTransaction,
    settlementFeeEnabled: snapshot.settlementFeeEnabled,
    settlementFeeRatePercent: snapshot.settlementFeeRatePercent,
    monthlyMinimumFeeEnabled: snapshot.monthlyMinimumFeeEnabled,
    monthlyMinimumFeeAmount: snapshot.monthlyMinimumFeeAmount,
    failedTrxEnabled: snapshot.failedTrxEnabled,
    failedTrxMode: snapshot.failedTrxMode,
    failedTrxOverLimitThresholdPercent: snapshot.failedTrxOverLimitThresholdPercent,
    contractSummarySettings: cloneContractSummarySettings(snapshot.contractSummarySettings),
    clientNotes: snapshot.clientNotes,
    // UI-only fields seeded from defaults — they are not part of the
    // persisted snapshot contract.
    showHardcodedConstants: DEFAULT_CALCULATOR_STATE.showHardcodedConstants,
    showZone3Formulas: DEFAULT_CALCULATOR_STATE.showZone3Formulas,
    showZone4Formulas: DEFAULT_CALCULATOR_STATE.showZone4Formulas,
    showUnifiedFormulas: DEFAULT_CALCULATOR_STATE.showUnifiedFormulas,
    unifiedExpandedById: { ...DEFAULT_CALCULATOR_STATE.unifiedExpandedById },
    zoneExpanded: { ...INITIAL_ZONE_EXPANDED }
  };
}
