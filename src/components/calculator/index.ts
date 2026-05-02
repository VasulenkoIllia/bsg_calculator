export { NumberField } from "./NumberField.js";
export type { NumberFieldProps } from "./NumberField.js";

export { ModeToggle, MiniToggle, CommissionModeCard } from "./controls.js";
export type {
  ModeToggleProps,
  MiniToggleProps,
  CommissionModeCardProps
} from "./controls.js";

export { MetricCard, FormulaLine } from "./cards.js";
export { ZoneSection } from "./ZoneSection.js";
export { UnifiedProfitabilityRow } from "./UnifiedProfitabilityRow.js";
export { CalculatorHeader, HardcodedConstantsPanel, CalculatorActionsPanel } from "./layout.js";

export {
  formatInputNumber,
  parseInputNumber,
  clampNumber,
  clampPercent,
  getNumberFieldConstraintNotice
} from "./numberUtils.js";

export { formatCount, formatMillion, formatSignedAmount, escapeHtml } from "./formatUtils.js";
export {
  resolveEffectiveMethodTrxFee,
  resolveMethodTrxRevenue,
  collectExpandableNodeIds,
  findPreviousZoneTarget
} from "./appHelpers.js";
export {
  DEFAULT_CALCULATOR_STATE,
  ZERO_CALCULATOR_STATE,
  INITIAL_ZONE_EXPANDED,
  clonePayinRegionPricingConfig,
  clonePayoutPricingConfig,
  cloneContractSummarySettings
} from "./statePresets.js";
export type { CalculatorStatePreset } from "./statePresets.js";
export { getHardcodedConstantGroups } from "./hardcodedConstants.js";
export { useCalculatorState } from "./useCalculatorState.js";
export { useCalculatorDerivedData } from "./useCalculatorDerivedData.js";

export type {
  ZoneId,
  ZoneSectionProps,
  ZoneNavigationTarget,
  ZoneSectionNavigation,
  UnifiedProfitabilityNode,
  HardcodedConstantGroup,
  HardcodedConstantItem
} from "./types.js";

export {
  Zone0CalculatorType,
  Zone1PayinTraffic,
  Zone1PayoutTraffic,
  Zone2IntroducerCommission,
  Zone3PricingConfiguration,
  Zone4OtherFeesAndLimits,
  Zone5ProfitabilityCalculations,
  Zone6OfferSummary
} from "./zones/index.js";
export type {
  Zone0CalculatorTypeProps,
  Zone1PayinTrafficProps,
  Zone1PayoutTrafficProps,
  Zone2IntroducerCommissionProps,
  Zone3PricingConfigurationProps,
  Zone4OtherFeesAndLimitsProps,
  Zone5ProfitabilityCalculationsProps,
  Zone6OfferSummaryProps
} from "./zones/index.js";
