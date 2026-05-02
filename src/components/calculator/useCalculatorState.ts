import { useMemo, useState } from "react";
import {
  applyCalculatorModeToggle,
  type CalculatorTypeSelection,
  type ContractSummarySettings,
  type FailedTrxChargingMode,
  type IntroducerCommissionType,
  type PayinRegionPricingConfig,
  type PricingModelType,
  type PricingRateMode,
  type PayoutPricingConfig
} from "../../domain/calculator/index.js";
import { findPreviousZoneTarget } from "./appHelpers.js";
import { getHardcodedConstantGroups } from "./hardcodedConstants.js";
import { clampNumber, clampPercent } from "./numberUtils.js";
import {
  cloneContractSummarySettings,
  clonePayinRegionPricingConfig,
  clonePayoutPricingConfig,
  DEFAULT_CALCULATOR_STATE,
  type CalculatorStatePreset,
  ZERO_CALCULATOR_STATE
} from "./statePresets.js";
import type {
  HardcodedConstantGroup,
  ZoneId,
  ZoneNavigationTarget,
  ZoneSectionNavigation
} from "./types.js";

export function useCalculatorState() {
  const [calculatorType, setCalculatorType] = useState<CalculatorTypeSelection>(
    DEFAULT_CALCULATOR_STATE.calculatorType
  );
  const [payinVolume, setPayinVolume] = useState(DEFAULT_CALCULATOR_STATE.payinVolume);
  const [payinTransactions, setPayinTransactions] = useState(
    DEFAULT_CALCULATOR_STATE.payinTransactions
  );
  const [approvalRatioPercent, setApprovalRatioPercent] = useState(
    DEFAULT_CALCULATOR_STATE.approvalRatioPercent
  );
  const [euPercent, setEuPercent] = useState(DEFAULT_CALCULATOR_STATE.euPercent);
  const [ccPercent, setCcPercent] = useState(DEFAULT_CALCULATOR_STATE.ccPercent);
  const [payoutVolume, setPayoutVolume] = useState(DEFAULT_CALCULATOR_STATE.payoutVolume);
  const [payoutTransactions, setPayoutTransactions] = useState(
    DEFAULT_CALCULATOR_STATE.payoutTransactions
  );
  const [introducerEnabled, setIntroducerEnabled] = useState(
    DEFAULT_CALCULATOR_STATE.introducerEnabled
  );
  const [introducerCommissionType, setIntroducerCommissionType] =
    useState<IntroducerCommissionType>(DEFAULT_CALCULATOR_STATE.introducerCommissionType);
  const [customTier1UpToMillion, setCustomTier1UpToMillion] = useState(
    DEFAULT_CALCULATOR_STATE.customTier1UpToMillion
  );
  const [customTier2UpToMillion, setCustomTier2UpToMillion] = useState(
    DEFAULT_CALCULATOR_STATE.customTier2UpToMillion
  );
  const [customTier1RatePerMillion, setCustomTier1RatePerMillion] = useState(
    DEFAULT_CALCULATOR_STATE.customTier1RatePerMillion
  );
  const [customTier2RatePerMillion, setCustomTier2RatePerMillion] = useState(
    DEFAULT_CALCULATOR_STATE.customTier2RatePerMillion
  );
  const [customTier3RatePerMillion, setCustomTier3RatePerMillion] = useState(
    DEFAULT_CALCULATOR_STATE.customTier3RatePerMillion
  );
  const [revSharePercent, setRevSharePercent] = useState(DEFAULT_CALCULATOR_STATE.revSharePercent);
  const [settlementIncluded, setSettlementIncluded] = useState(
    DEFAULT_CALCULATOR_STATE.settlementIncluded
  );
  const [payinEuPricing, setPayinEuPricing] = useState<PayinRegionPricingConfig>(
    () => clonePayinRegionPricingConfig(DEFAULT_CALCULATOR_STATE.payinEuPricing)
  );
  const [payinWwPricing, setPayinWwPricing] = useState<PayinRegionPricingConfig>(
    () => clonePayinRegionPricingConfig(DEFAULT_CALCULATOR_STATE.payinWwPricing)
  );
  const [payoutPricing, setPayoutPricing] = useState<PayoutPricingConfig>(
    () => clonePayoutPricingConfig(DEFAULT_CALCULATOR_STATE.payoutPricing)
  );
  const [payoutMinimumFeeEnabled, setPayoutMinimumFeeEnabled] = useState(
    DEFAULT_CALCULATOR_STATE.payoutMinimumFeeEnabled
  );
  const [payoutMinimumFeePerTransaction, setPayoutMinimumFeePerTransaction] = useState(
    DEFAULT_CALCULATOR_STATE.payoutMinimumFeePerTransaction
  );
  const [threeDsEnabled, setThreeDsEnabled] = useState(DEFAULT_CALCULATOR_STATE.threeDsEnabled);
  const [threeDsRevenuePerSuccessfulTransaction, setThreeDsRevenuePerSuccessfulTransaction] =
    useState(DEFAULT_CALCULATOR_STATE.threeDsRevenuePerSuccessfulTransaction);
  const [settlementFeeEnabled, setSettlementFeeEnabled] = useState(
    DEFAULT_CALCULATOR_STATE.settlementFeeEnabled
  );
  const [settlementFeeRatePercent, setSettlementFeeRatePercent] = useState(
    DEFAULT_CALCULATOR_STATE.settlementFeeRatePercent
  );
  const [monthlyMinimumFeeEnabled, setMonthlyMinimumFeeEnabled] = useState(
    DEFAULT_CALCULATOR_STATE.monthlyMinimumFeeEnabled
  );
  const [monthlyMinimumFeeAmount, setMonthlyMinimumFeeAmount] = useState(
    DEFAULT_CALCULATOR_STATE.monthlyMinimumFeeAmount
  );
  const [failedTrxEnabled, setFailedTrxEnabled] = useState(
    DEFAULT_CALCULATOR_STATE.failedTrxEnabled
  );
  const [failedTrxMode, setFailedTrxMode] = useState<FailedTrxChargingMode>(
    DEFAULT_CALCULATOR_STATE.failedTrxMode
  );
  const [failedTrxOverLimitThresholdPercent, setFailedTrxOverLimitThresholdPercent] = useState(
    DEFAULT_CALCULATOR_STATE.failedTrxOverLimitThresholdPercent
  );
  const [contractSummarySettings, setContractSummarySettings] = useState<ContractSummarySettings>(
    () => cloneContractSummarySettings(DEFAULT_CALCULATOR_STATE.contractSummarySettings)
  );
  const [clientNotes, setClientNotes] = useState(DEFAULT_CALCULATOR_STATE.clientNotes);
  const [offerSummaryActionMessage, setOfferSummaryActionMessage] = useState<string | null>(null);
  const [showHardcodedConstants, setShowHardcodedConstants] = useState(
    DEFAULT_CALCULATOR_STATE.showHardcodedConstants
  );
  const [showZone3Formulas, setShowZone3Formulas] = useState(
    DEFAULT_CALCULATOR_STATE.showZone3Formulas
  );
  const [showZone4Formulas, setShowZone4Formulas] = useState(
    DEFAULT_CALCULATOR_STATE.showZone4Formulas
  );
  const [showUnifiedFormulas, setShowUnifiedFormulas] = useState(
    DEFAULT_CALCULATOR_STATE.showUnifiedFormulas
  );
  const [unifiedExpandedById, setUnifiedExpandedById] = useState<Record<string, boolean>>(
    DEFAULT_CALCULATOR_STATE.unifiedExpandedById
  );
  const [zoneExpanded, setZoneExpanded] = useState<Record<ZoneId, boolean>>(
    DEFAULT_CALCULATOR_STATE.zoneExpanded
  );

  const wwPercent = 100 - euPercent;
  const apmPercent = 100 - ccPercent;
  const hardcodedConstantGroups = useMemo<HardcodedConstantGroup[]>(
    () => getHardcodedConstantGroups(),
    []
  );

  const setPayinEnabled = (checked: boolean) => {
    setCalculatorType(current => applyCalculatorModeToggle(current, "payin", checked));
  };

  const setPayoutEnabled = (checked: boolean) => {
    setCalculatorType(current => applyCalculatorModeToggle(current, "payout", checked));
  };

  const applyStatePreset = (preset: CalculatorStatePreset) => {
    setCalculatorType({ ...preset.calculatorType });
    setPayinVolume(preset.payinVolume);
    setPayinTransactions(preset.payinTransactions);
    setApprovalRatioPercent(preset.approvalRatioPercent);
    setEuPercent(preset.euPercent);
    setCcPercent(preset.ccPercent);
    setPayoutVolume(preset.payoutVolume);
    setPayoutTransactions(preset.payoutTransactions);
    setIntroducerEnabled(preset.introducerEnabled);
    setIntroducerCommissionType(preset.introducerCommissionType);
    setCustomTier1UpToMillion(preset.customTier1UpToMillion);
    setCustomTier2UpToMillion(preset.customTier2UpToMillion);
    setCustomTier1RatePerMillion(preset.customTier1RatePerMillion);
    setCustomTier2RatePerMillion(preset.customTier2RatePerMillion);
    setCustomTier3RatePerMillion(preset.customTier3RatePerMillion);
    setRevSharePercent(preset.revSharePercent);
    setSettlementIncluded(preset.settlementIncluded);
    setPayinEuPricing(clonePayinRegionPricingConfig(preset.payinEuPricing));
    setPayinWwPricing(clonePayinRegionPricingConfig(preset.payinWwPricing));
    setPayoutPricing(clonePayoutPricingConfig(preset.payoutPricing));
    setPayoutMinimumFeeEnabled(preset.payoutMinimumFeeEnabled);
    setPayoutMinimumFeePerTransaction(preset.payoutMinimumFeePerTransaction);
    setThreeDsEnabled(preset.threeDsEnabled);
    setThreeDsRevenuePerSuccessfulTransaction(preset.threeDsRevenuePerSuccessfulTransaction);
    setSettlementFeeEnabled(preset.settlementFeeEnabled);
    setSettlementFeeRatePercent(preset.settlementFeeRatePercent);
    setMonthlyMinimumFeeEnabled(preset.monthlyMinimumFeeEnabled);
    setMonthlyMinimumFeeAmount(preset.monthlyMinimumFeeAmount);
    setFailedTrxEnabled(preset.failedTrxEnabled);
    setFailedTrxMode(preset.failedTrxMode);
    setFailedTrxOverLimitThresholdPercent(preset.failedTrxOverLimitThresholdPercent);
    setContractSummarySettings(cloneContractSummarySettings(preset.contractSummarySettings));
    setClientNotes(preset.clientNotes);
    setOfferSummaryActionMessage(null);
    setShowHardcodedConstants(preset.showHardcodedConstants);
    setShowZone3Formulas(preset.showZone3Formulas);
    setShowZone4Formulas(preset.showZone4Formulas);
    setShowUnifiedFormulas(preset.showUnifiedFormulas);
    setUnifiedExpandedById({ ...preset.unifiedExpandedById });
    setZoneExpanded({ ...preset.zoneExpanded });
  };

  const resetAllValuesToZero = () => {
    applyStatePreset(ZERO_CALCULATOR_STATE);
  };

  const applyDefaultValues = () => {
    applyStatePreset(DEFAULT_CALCULATOR_STATE);
  };

  const toggleHardcodedConstantsAndZoneFormulas = () => {
    const next = !showHardcodedConstants;
    setShowHardcodedConstants(next);
    setShowZone3Formulas(next);
    setShowZone4Formulas(next);
  };

  const handleEuChange = (value: number) => setEuPercent(clampPercent(value));
  const handleWwChange = (value: number) => setEuPercent(100 - clampPercent(value));
  const handleCcChange = (value: number) => setCcPercent(clampPercent(value));
  const handleApmChange = (value: number) => setCcPercent(100 - clampPercent(value));

  const handleCustomTier1UpToChange = (value: number) => {
    const normalized = Math.max(0, value);
    setCustomTier1UpToMillion(normalized);
    setCustomTier2UpToMillion(current => Math.max(current, normalized));
  };

  const handleCustomTier2UpToChange = (value: number) => {
    const normalized = Math.max(customTier1UpToMillion, value);
    setCustomTier2UpToMillion(normalized);
  };

  const handleRevSharePercentChange = (value: number) => {
    setRevSharePercent(clampNumber(value, 0, 50));
  };

  const setPayinRegionModel = (region: "eu" | "ww", model: PricingModelType) => {
    if (region === "eu") {
      setPayinEuPricing(current => ({ ...current, model }));
      return;
    }
    setPayinWwPricing(current => ({ ...current, model }));
  };

  const setPayinRegionRateMode = (region: "eu" | "ww", rateMode: PricingRateMode) => {
    if (region === "eu") {
      setPayinEuPricing(current => ({ ...current, rateMode }));
      return;
    }
    setPayinWwPricing(current => ({ ...current, rateMode }));
  };

  const setPayinRegionTrxEnabled = (region: "eu" | "ww", enabled: boolean) => {
    if (region === "eu") {
      setPayinEuPricing(current => ({ ...current, trxFeeEnabled: enabled }));
      return;
    }
    setPayinWwPricing(current => ({ ...current, trxFeeEnabled: enabled }));
  };

  const setPayinRegionSingleField = (
    region: "eu" | "ww",
    field: "mdrPercent" | "trxCc" | "trxApm",
    value: number
  ) => {
    const normalizedValue = Math.max(0, value);
    if (region === "eu") {
      setPayinEuPricing(current => ({
        ...current,
        single: { ...current.single, [field]: normalizedValue }
      }));
      return;
    }
    setPayinWwPricing(current => ({
      ...current,
      single: { ...current.single, [field]: normalizedValue }
    }));
  };

  const setPayinRegionTierField = (
    region: "eu" | "ww",
    tierIndex: 0 | 1 | 2,
    field: "mdrPercent" | "trxCc" | "trxApm",
    value: number
  ) => {
    const normalizedValue = Math.max(0, value);
    const update = (current: PayinRegionPricingConfig): PayinRegionPricingConfig => ({
      ...current,
      tiers: current.tiers.map((tier, index) =>
        index === tierIndex ? { ...tier, [field]: normalizedValue } : tier
      ) as PayinRegionPricingConfig["tiers"]
    });

    if (region === "eu") {
      setPayinEuPricing(update);
      return;
    }
    setPayinWwPricing(update);
  };

  const setPayinRegionTierBoundary = (
    region: "eu" | "ww",
    boundary: "tier1UpToMillion" | "tier2UpToMillion",
    value: number
  ) => {
    const normalized = clampNumber(Math.max(0, value), 0, 25);
    const update = (current: PayinRegionPricingConfig): PayinRegionPricingConfig => {
      if (boundary === "tier1UpToMillion") {
        return {
          ...current,
          tier1UpToMillion: normalized,
          tier2UpToMillion: Math.max(current.tier2UpToMillion, normalized)
        };
      }
      return {
        ...current,
        tier2UpToMillion: Math.max(current.tier1UpToMillion, normalized)
      };
    };

    if (region === "eu") {
      setPayinEuPricing(update);
      return;
    }
    setPayinWwPricing(update);
  };

  const setPayoutRateMode = (rateMode: PricingRateMode) => {
    setPayoutPricing(current => ({ ...current, rateMode }));
  };

  const setPayoutSingleField = (field: "mdrPercent" | "trxFee", value: number) => {
    setPayoutPricing(current => ({
      ...current,
      single: { ...current.single, [field]: Math.max(0, value) }
    }));
  };

  const setPayoutTierField = (
    tierIndex: 0 | 1 | 2,
    field: "mdrPercent" | "trxFee",
    value: number
  ) => {
    setPayoutPricing(current => ({
      ...current,
      tiers: current.tiers.map((tier, index) =>
        index === tierIndex ? { ...tier, [field]: Math.max(0, value) } : tier
      ) as PayoutPricingConfig["tiers"]
    }));
  };

  const setPayoutTierBoundary = (
    boundary: "tier1UpToMillion" | "tier2UpToMillion",
    value: number
  ) => {
    const normalized = clampNumber(Math.max(0, value), 0, 25);
    setPayoutPricing(current => {
      if (boundary === "tier1UpToMillion") {
        return {
          ...current,
          tier1UpToMillion: normalized,
          tier2UpToMillion: Math.max(current.tier2UpToMillion, normalized)
        };
      }
      return {
        ...current,
        tier2UpToMillion: Math.max(current.tier1UpToMillion, normalized)
      };
    });
  };

  const setContractSummaryField = <T extends keyof ContractSummarySettings>(
    field: T,
    value: ContractSummarySettings[T]
  ) => {
    setContractSummarySettings(current => ({ ...current, [field]: value }));
  };

  const toggleZone = (zoneId: ZoneId) => {
    setZoneExpanded(current => ({ ...current, [zoneId]: !current[zoneId] }));
  };

  const navigateToZone = (zoneId: ZoneId) => {
    setZoneExpanded(current => ({ ...current, [zoneId]: true }));
    document.getElementById(zoneId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const visiblePrimaryZones = useMemo<ZoneNavigationTarget[]>(() => {
    const zones: ZoneNavigationTarget[] = [{ id: "zone0", title: "Zone 0: Calculator Type" }];

    if (calculatorType.payin) {
      zones.push({ id: "zone1a", title: "Zone 1A: Payin Traffic Input" });
    }

    if (calculatorType.payout) {
      zones.push({ id: "zone1b", title: "Zone 1B: Payout Traffic Input" });
    }

    zones.push(
      { id: "zone2", title: "Zone 2: Introducer Commission" },
      { id: "zone3", title: "Zone 3: Pricing Configuration" },
      { id: "zone4", title: "Zone 4: Other Fees & Limits" },
      { id: "zone5", title: "Zone 5: Profitability Calculations" },
      { id: "zone6", title: "Zone 6: Offer Summary" }
    );

    return zones;
  }, [calculatorType.payin, calculatorType.payout]);

  const getZoneNavigation = (zoneId: ZoneId): ZoneSectionNavigation | undefined => {
    const start = visiblePrimaryZones[0];
    const previous = findPreviousZoneTarget(zoneId, visiblePrimaryZones);
    if (!start || !previous) return undefined;

    return {
      start,
      previous,
      onNavigate: navigateToZone
    };
  };

  return {
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
    setCalculatorType,
    setPayinVolume,
    setPayinTransactions,
    setApprovalRatioPercent,
    setEuPercent,
    setCcPercent,
    setPayoutVolume,
    setPayoutTransactions,
    setIntroducerEnabled,
    setIntroducerCommissionType,
    setCustomTier1UpToMillion,
    setCustomTier2UpToMillion,
    setCustomTier1RatePerMillion,
    setCustomTier2RatePerMillion,
    setCustomTier3RatePerMillion,
    setRevSharePercent,
    setSettlementIncluded,
    setPayinEuPricing,
    setPayinWwPricing,
    setPayoutPricing,
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
    setContractSummarySettings,
    setContractSummaryField,
    setClientNotes,
    setOfferSummaryActionMessage,
    setShowHardcodedConstants,
    setShowZone3Formulas,
    setShowZone4Formulas,
    setShowUnifiedFormulas,
    setUnifiedExpandedById,
    setZoneExpanded,
    setPayinEnabled,
    setPayoutEnabled,
    applyStatePreset,
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
    toggleZone,
    getZoneNavigation
  };
}
