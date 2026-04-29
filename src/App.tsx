import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState
} from "react";
import {
  DEFAULT_3DS_FEE_CONFIG,
  DEFAULT_CONTRACT_SUMMARY_SETTINGS,
  DEFAULT_FAILED_TRX_CHARGING_CONFIG,
  DEFAULT_MONTHLY_MINIMUM_FEE_CONFIG,
  DEFAULT_CUSTOM_TIER_SETTINGS,
  DEFAULT_STANDARD_TIERS,
  DEFAULT_PAYIN_EU_PRICING_CONFIG,
  DEFAULT_PAYOUT_MINIMUM_FEE_CONFIG,
  DEFAULT_PAYIN_WW_PRICING_CONFIG,
  DEFAULT_PAYOUT_PRICING_CONFIG,
  PAYOUT_MDR_MIN_PERCENT,
  PAYOUT_TRX_MIN_FEE,
  DEFAULT_PROVIDER_PAYIN_TRX_APM_COST,
  DEFAULT_PROVIDER_PAYIN_TRX_CC_COST,
  DEFAULT_SETTLEMENT_FEE_CONFIG,
  DEFAULT_SETTLEMENT_INCLUDED,
  applyCalculatorModeToggle,
  calculateOtherRevenueProfitability,
  calculateFailedTrxImpact,
  calculateMonthlyMinimumFeeImpact,
  calculatePayoutMinimumFeeImpact,
  calculatePayinProfitability,
  calculatePayinRegionPricingPreview,
  calculatePayoutProfitability,
  calculatePayoutPricingPreview,
  calculateSettlementFeeImpact,
  calculateThreeDsImpact,
  buildOfferSummaryText,
  calculateTotalProfitability,
  calculateCustomIntroducerCommission,
  calculateRevShareIntroducerCommission,
  calculateStandardIntroducerCommission,
  derivePayinTraffic,
  derivePayoutTraffic,
  normalizePayoutMinimumFeePerTransaction,
  type ContractSummarySettings,
  type CalculatorTypeSelection,
  type FailedTrxChargingMode,
  type IntroducerCommissionType,
  type PayinRegionPricingConfig,
  type PayinRegionPricingPreview,
  type PricingModelType,
  type PayoutMinimumFeeMode,
  type PricingRateMode,
  type PayoutPricingConfig,
  type SettlementPeriod,
  formatAmount2,
  formatAmountInteger
} from "./domain/calculator/index.js";

type NumberFieldProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  helper?: string;
  helperTone?: "default" | "warning";
  readOnly?: boolean;
};

type ModeToggleProps = {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
};

type CommissionModeCardProps = {
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
};

type MiniToggleProps = {
  label: string;
  selected: boolean;
  onSelect: () => void;
  ariaLabel: string;
};

type ZoneId =
  | "zone0"
  | "zone1a"
  | "zone1b"
  | "zone2"
  | "zone3"
  | "zone4"
  | "zone5"
  | "zone6"
  | "derivedPayin"
  | "derivedPayout";

type ZoneSectionProps = {
  id: ZoneId;
  title: string;
  subtitle?: string;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
  navigation?: ZoneSectionNavigation;
  panelClassName?: string;
  headerClassName?: string;
  contentClassName?: string;
};

type ZoneNavigationTarget = {
  id: ZoneId;
  title: string;
};

type ZoneSectionNavigation = {
  start: ZoneNavigationTarget;
  previous: ZoneNavigationTarget;
  onNavigate: (zoneId: ZoneId) => void;
};

type UnifiedProfitabilityNode = {
  id: string;
  label: string;
  value: number;
  formula?: string;
  children?: UnifiedProfitabilityNode[];
};

type CalculatorStatePreset = {
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
  showZone3Formulas: boolean;
  showZone4Formulas: boolean;
  showUnifiedFormulas: boolean;
  unifiedExpandedById: Record<string, boolean>;
  zoneExpanded: Record<ZoneId, boolean>;
};

const INITIAL_ZONE_EXPANDED: Record<ZoneId, boolean> = {
  zone0: true,
  zone1a: true,
  zone1b: true,
  zone2: true,
  zone3: true,
  zone4: true,
  zone5: true,
  zone6: true,
  derivedPayin: true,
  derivedPayout: true
};

const DEFAULT_CALCULATOR_TYPE: CalculatorTypeSelection = {
  payin: true,
  payout: false
};

const ZERO_CALCULATOR_TYPE: CalculatorTypeSelection = {
  payin: true,
  payout: false
};

const ZERO_PAYIN_REGION_PRICING_CONFIG: PayinRegionPricingConfig = {
  model: "icpp",
  trxFeeEnabled: false,
  rateMode: "single",
  tier1UpToMillion: 0,
  tier2UpToMillion: 0,
  single: {
    mdrPercent: 0,
    trxCc: 0,
    trxApm: 0
  },
  tiers: [
    { mdrPercent: 0, trxCc: 0, trxApm: 0 },
    { mdrPercent: 0, trxCc: 0, trxApm: 0 },
    { mdrPercent: 0, trxCc: 0, trxApm: 0 }
  ],
  schemeFeesPercent: 0,
  interchangePercent: 0
};

const ZERO_PAYOUT_PRICING_CONFIG: PayoutPricingConfig = {
  rateMode: "single",
  tier1UpToMillion: 0,
  tier2UpToMillion: 0,
  single: {
    mdrPercent: 0,
    trxFee: 0
  },
  tiers: [
    { mdrPercent: 0, trxFee: 0 },
    { mdrPercent: 0, trxFee: 0 },
    { mdrPercent: 0, trxFee: 0 }
  ]
};

const ZERO_CONTRACT_SUMMARY_SETTINGS: ContractSummarySettings = {
  accountSetupFee: 0,
  refundCost: 0,
  disputeCost: 0,
  settlementPeriod: "T+1",
  collectionLimitMin: 0,
  collectionLimitMax: 0,
  payoutLimitMin: 0,
  payoutLimitMax: 0,
  rollingReservePercent: 0,
  rollingReserveHoldDays: 0,
  rollingReserveCap: 0,
  payoutMinimumFeeMode: "overall",
  payoutMinimumFeeThresholdMillion: 0,
  payoutMinimumFeePerTransaction: 0,
  payoutMinimumFeeEuThresholdMillion: 0,
  payoutMinimumFeeEuPerTransaction: 0,
  payoutMinimumFeeWwThresholdMillion: 0,
  payoutMinimumFeeWwPerTransaction: 0
};

const DEFAULT_CALCULATOR_STATE: CalculatorStatePreset = {
  calculatorType: DEFAULT_CALCULATOR_TYPE,
  payinVolume: 1_000_000,
  payinTransactions: 10_000,
  approvalRatioPercent: 80,
  euPercent: 80,
  ccPercent: 90,
  payoutVolume: 200_000,
  payoutTransactions: 2_000,
  introducerEnabled: false,
  introducerCommissionType: "standard",
  customTier1UpToMillion: DEFAULT_CUSTOM_TIER_SETTINGS.tier1UpToMillion,
  customTier2UpToMillion: DEFAULT_CUSTOM_TIER_SETTINGS.tier2UpToMillion,
  customTier1RatePerMillion: DEFAULT_CUSTOM_TIER_SETTINGS.tier1RatePerMillion,
  customTier2RatePerMillion: DEFAULT_CUSTOM_TIER_SETTINGS.tier2RatePerMillion,
  customTier3RatePerMillion: DEFAULT_CUSTOM_TIER_SETTINGS.tier3RatePerMillion,
  revSharePercent: 25,
  settlementIncluded: DEFAULT_SETTLEMENT_INCLUDED,
  payinEuPricing: DEFAULT_PAYIN_EU_PRICING_CONFIG,
  payinWwPricing: DEFAULT_PAYIN_WW_PRICING_CONFIG,
  payoutPricing: DEFAULT_PAYOUT_PRICING_CONFIG,
  payoutMinimumFeeEnabled: DEFAULT_PAYOUT_MINIMUM_FEE_CONFIG.enabled,
  payoutMinimumFeePerTransaction: DEFAULT_PAYOUT_MINIMUM_FEE_CONFIG.minimumFeePerTransaction,
  threeDsEnabled: DEFAULT_3DS_FEE_CONFIG.enabled,
  threeDsRevenuePerSuccessfulTransaction: DEFAULT_3DS_FEE_CONFIG.revenuePerSuccessfulTransaction,
  settlementFeeEnabled: DEFAULT_SETTLEMENT_FEE_CONFIG.enabled,
  settlementFeeRatePercent: DEFAULT_SETTLEMENT_FEE_CONFIG.ratePercent,
  monthlyMinimumFeeEnabled: DEFAULT_MONTHLY_MINIMUM_FEE_CONFIG.enabled,
  monthlyMinimumFeeAmount: DEFAULT_MONTHLY_MINIMUM_FEE_CONFIG.minimumMonthlyRevenue,
  failedTrxEnabled: DEFAULT_FAILED_TRX_CHARGING_CONFIG.enabled,
  failedTrxMode: DEFAULT_FAILED_TRX_CHARGING_CONFIG.mode,
  failedTrxOverLimitThresholdPercent: DEFAULT_FAILED_TRX_CHARGING_CONFIG.overLimitThresholdPercent,
  contractSummarySettings: DEFAULT_CONTRACT_SUMMARY_SETTINGS,
  clientNotes: "",
  showZone3Formulas: true,
  showZone4Formulas: true,
  showUnifiedFormulas: true,
  unifiedExpandedById: {},
  zoneExpanded: INITIAL_ZONE_EXPANDED
};

const ZERO_CALCULATOR_STATE: CalculatorStatePreset = {
  calculatorType: ZERO_CALCULATOR_TYPE,
  payinVolume: 0,
  payinTransactions: 0,
  approvalRatioPercent: 0,
  euPercent: 0,
  ccPercent: 0,
  payoutVolume: 0,
  payoutTransactions: 0,
  introducerEnabled: false,
  introducerCommissionType: "standard",
  customTier1UpToMillion: 0,
  customTier2UpToMillion: 0,
  customTier1RatePerMillion: 0,
  customTier2RatePerMillion: 0,
  customTier3RatePerMillion: 0,
  revSharePercent: 0,
  settlementIncluded: false,
  payinEuPricing: ZERO_PAYIN_REGION_PRICING_CONFIG,
  payinWwPricing: ZERO_PAYIN_REGION_PRICING_CONFIG,
  payoutPricing: ZERO_PAYOUT_PRICING_CONFIG,
  payoutMinimumFeeEnabled: false,
  payoutMinimumFeePerTransaction: 0,
  threeDsEnabled: false,
  threeDsRevenuePerSuccessfulTransaction: 0,
  settlementFeeEnabled: false,
  settlementFeeRatePercent: 0,
  monthlyMinimumFeeEnabled: false,
  monthlyMinimumFeeAmount: 0,
  failedTrxEnabled: false,
  failedTrxMode: "overLimitOnly",
  failedTrxOverLimitThresholdPercent: 0,
  contractSummarySettings: ZERO_CONTRACT_SUMMARY_SETTINGS,
  clientNotes: "",
  showZone3Formulas: true,
  showZone4Formulas: true,
  showUnifiedFormulas: true,
  unifiedExpandedById: {},
  zoneExpanded: INITIAL_ZONE_EXPANDED
};

function formatCount(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

function formatMillion(value: number): string {
  if (!Number.isFinite(value)) return "0.00M";
  return `${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}M`;
}

function formatInputNumber(value: number): string {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  });
}

function formatSignedAmount(value: number): string {
  if (value < 0) {
    return `-${formatAmount2(Math.abs(value))}`;
  }
  return formatAmount2(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function parseInputNumber(raw: string): number {
  const normalized = raw.replace(/\s+/g, "").replace(/,/g, "");
  if (normalized === "" || normalized === "-" || normalized === "." || normalized === "-.") {
    return Number.NaN;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function clampNumber(value: number, min?: number, max?: number): number {
  let clamped = value;

  if (typeof min === "number") {
    clamped = Math.max(clamped, min);
  }

  if (typeof max === "number") {
    clamped = Math.min(clamped, max);
  }

  return clamped;
}

function getNumberFieldConstraintNotice(value: number, min?: number, max?: number): string | undefined {
  if (typeof min === "number" && value < min) {
    return `Minimum allowed value is ${formatInputNumber(min)}. Lower values reset to ${formatInputNumber(min)}.`;
  }

  if (typeof max === "number" && value > max) {
    return `Maximum allowed value is ${formatInputNumber(max)}. Higher values reset to ${formatInputNumber(max)}.`;
  }

  return undefined;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function resolveEffectiveMethodTrxFee(
  config: PayinRegionPricingConfig,
  preview: PayinRegionPricingPreview,
  method: "cc" | "apm"
): number {
  if (config.rateMode === "single") {
    return method === "cc" ? config.single.trxCc : config.single.trxApm;
  }

  const rows = preview.tierRows;
  if (rows.length === 0) {
    return method === "cc" ? config.single.trxCc : config.single.trxApm;
  }

  const weightedFee = rows.reduce((sum, row) => {
    const transactions = method === "cc" ? row.ccTransactions : row.apmTransactions;
    const fee = method === "cc" ? row.trxCc : row.trxApm;
    return sum + transactions * fee;
  }, 0);
  const totalTransactions = rows.reduce((sum, row) => {
    const transactions = method === "cc" ? row.ccTransactions : row.apmTransactions;
    return sum + transactions;
  }, 0);

  if (totalTransactions <= 0) {
    return method === "cc" ? config.tiers[0].trxCc : config.tiers[0].trxApm;
  }

  return weightedFee / totalTransactions;
}

function resolveMethodTrxRevenue(
  config: PayinRegionPricingConfig,
  preview: PayinRegionPricingPreview,
  successfulTransactions: number,
  method: "cc" | "apm"
): number {
  if (!config.trxFeeEnabled) return 0;

  if (config.rateMode === "single") {
    return successfulTransactions * (method === "cc" ? config.single.trxCc : config.single.trxApm);
  }

  if (preview.tierRows.length === 0) return 0;

  return preview.tierRows.reduce((sum, row) => {
    const transactions = method === "cc" ? row.ccTransactions : row.apmTransactions;
    const fee = method === "cc" ? row.trxCc : row.trxApm;
    return sum + transactions * fee;
  }, 0);
}

function collectExpandableNodeIds(nodes: UnifiedProfitabilityNode[]): string[] {
  const ids: string[] = [];

  const walk = (node: UnifiedProfitabilityNode) => {
    if (node.children && node.children.length > 0) {
      ids.push(node.id);
      node.children.forEach(walk);
    }
  };

  nodes.forEach(walk);
  return ids;
}

function clonePayinRegionPricingConfig(
  config: PayinRegionPricingConfig
): PayinRegionPricingConfig {
  return {
    ...config,
    single: { ...config.single },
    tiers: config.tiers.map(tier => ({ ...tier })) as PayinRegionPricingConfig["tiers"]
  };
}

function clonePayoutPricingConfig(config: PayoutPricingConfig): PayoutPricingConfig {
  return {
    ...config,
    single: { ...config.single },
    tiers: config.tiers.map(tier => ({ ...tier })) as PayoutPricingConfig["tiers"]
  };
}

function cloneContractSummarySettings(
  settings: ContractSummarySettings
): ContractSummarySettings {
  return { ...settings };
}

function findPreviousZoneTarget(
  zoneId: ZoneId,
  zones: ZoneNavigationTarget[]
): ZoneNavigationTarget | undefined {
  const zoneIndex = zones.findIndex(zone => zone.id === zoneId);
  return zoneIndex > 0 ? zones[zoneIndex - 1] : undefined;
}

function UnifiedProfitabilityRow({
  node,
  level,
  expandedById,
  onToggle,
  showFormulas
}: {
  node: UnifiedProfitabilityNode;
  level: number;
  expandedById: Record<string, boolean>;
  onToggle: (id: string) => void;
  showFormulas: boolean;
}) {
  const hasChildren = Boolean(node.children && node.children.length > 0);
  const isExpanded = hasChildren ? (expandedById[node.id] ?? true) : false;
  const valueClass =
    node.value < 0 ? "text-rose-600" : node.value > 0 ? "text-emerald-600" : "text-slate-700";

  return (
    <div className={level > 0 ? "border-l border-blue-200" : ""}>
      <div
        className="flex items-center justify-between gap-3 border-b border-slate-100 py-2"
        style={{ paddingLeft: `${level * 18}px` }}
      >
        <div className="flex min-w-0 items-center gap-2">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => onToggle(node.id)}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100"
              aria-label={`${isExpanded ? "Collapse" : "Expand"} ${node.label}`}
            >
              {isExpanded ? "▾" : "▸"}
            </button>
          ) : (
            <span className="inline-flex h-6 w-6 items-center justify-center text-slate-300">•</span>
          )}
          <p className="truncate text-sm font-semibold text-slate-800">{node.label}</p>
        </div>
        <p className={["text-sm font-extrabold tabular-nums", valueClass].join(" ")}>
          {formatSignedAmount(node.value)}
        </p>
      </div>

      {showFormulas && node.formula ? (
        <p
          className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
          style={{ marginLeft: `${level * 18 + 28}px`, marginTop: "8px", marginBottom: "8px" }}
        >
          Formula (Unified): {node.formula}
        </p>
      ) : null}

      {hasChildren && isExpanded
        ? node.children?.map(child => (
            <UnifiedProfitabilityRow
              key={child.id}
              node={child}
              level={level + 1}
              expandedById={expandedById}
              onToggle={onToggle}
              showFormulas={showFormulas}
            />
          ))
        : null}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  helper,
  helperTone = "default",
  readOnly = false
}: NumberFieldProps) {
  const [isFocused, setIsFocused] = useState(false);
  const [draftValue, setDraftValue] = useState(formatInputNumber(value));
  const [constraintNotice, setConstraintNotice] = useState<string | undefined>();

  useEffect(() => {
    if (!isFocused) {
      setDraftValue(formatInputNumber(value));
    }
  }, [isFocused, value]);

  const handleChange = (nextRaw: string) => {
    if (readOnly) return;
    setDraftValue(nextRaw);
    const parsed = parseInputNumber(nextRaw);

    if (Number.isNaN(parsed)) {
      setConstraintNotice(undefined);
      return;
    }

    setConstraintNotice(getNumberFieldConstraintNotice(parsed, min, max));
    onChange(clampNumber(parsed, min, max));
  };

  const handleBlur = () => {
    if (readOnly) return;
    setIsFocused(false);
    const parsed = parseInputNumber(draftValue);

    if (Number.isNaN(parsed)) {
      setDraftValue(formatInputNumber(value));
      setConstraintNotice(undefined);
      return;
    }

    const clamped = clampNumber(parsed, min, max);
    setConstraintNotice(getNumberFieldConstraintNotice(parsed, min, max));
    onChange(clamped);
    setDraftValue(formatInputNumber(clamped));
  };

  const handleFocus = () => {
    if (readOnly) return;
    setIsFocused(true);
    setDraftValue(String(value));
  };

  const activeHelper = helperTone === "warning" && helper ? helper : constraintNotice ?? helper;
  const activeHelperTone = constraintNotice || helperTone === "warning" ? "warning" : "default";

  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input
        className={[
          "field-input",
          readOnly
            ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-700 focus:border-slate-200 focus:ring-0"
            : ""
        ].join(" ")}
        type="text"
        inputMode="decimal"
        aria-label={label}
        value={isFocused ? draftValue : formatInputNumber(value)}
        onChange={event => handleChange(event.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        readOnly={readOnly}
        aria-readonly={readOnly}
        min={min}
        max={max}
        step={step}
      />
      {activeHelper ? (
        <span
          className={[
            "mt-1 block text-xs",
            activeHelperTone === "warning"
              ? "rounded-md border border-amber-200 bg-amber-50 px-2 py-1 font-semibold text-amber-800"
              : "text-slate-500"
          ].join(" ")}
        >
          {activeHelper}
        </span>
      ) : null}
    </label>
  );
}

function ModeToggle({ label, checked, onChange }: ModeToggleProps) {
  return (
    <label
      className={[
        "inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-base font-semibold transition",
        checked
          ? "border-blue-400 bg-blue-50 text-blue-900 shadow-sm"
          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
      ].join(" ")}
    >
      <input
        className="h-4 w-4 accent-blue-600"
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

function MiniToggle({ label, selected, onSelect, ariaLabel }: MiniToggleProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={[
        "rounded-lg border px-3 py-2 text-sm font-semibold transition",
        selected
          ? "border-blue-400 bg-blue-50 text-blue-900"
          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function CommissionModeCard({
  label,
  description,
  selected,
  onSelect
}: CommissionModeCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Commission model: ${label}`}
      className={[
        "rounded-xl border p-4 text-left transition",
        selected
          ? "border-blue-400 bg-blue-50 shadow-sm"
          : "border-slate-200 bg-white hover:border-slate-300"
      ].join(" ")}
    >
      <p className="text-base font-bold text-slate-900">{label}</p>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
    </button>
  );
}

function MetricCard({
  name,
  value,
  className = ""
}: {
  name: string;
  value: string;
  className?: string;
}) {
  return (
    <div className={["metric-card", className].join(" ")}>
      <p className="metric-name">{name}</p>
      <p className="metric-value">{value}</p>
    </div>
  );
}

function FormulaLine({
  children,
  className = ""
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={[
        "rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600",
        className
      ].join(" ")}
    >
      {children}
    </p>
  );
}

function FormulaVisibilityToggle({
  scopeLabel,
  showFormulas,
  onToggle
}: {
  scopeLabel: string;
  showFormulas: boolean;
  onToggle: () => void;
}) {
  const action = showFormulas ? "Hide" : "Show";

  return (
    <button
      type="button"
      aria-label={`${action} ${scopeLabel} formulas`}
      onClick={onToggle}
      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
    >
      {action} formulas
    </button>
  );
}

function SpecAmbiguityNotice({
  title,
  currentValue,
  sourceContext,
  usedInFormulas
}: {
  title: string;
  currentValue?: string;
  sourceContext: string;
  usedInFormulas: string[];
}) {
  return (
    <div className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-3 text-xs text-rose-900">
      <p className="font-semibold">Питання по специфікації: {title}</p>
      {currentValue ? <p className="mt-1">Поточне значення в калькуляторі: {currentValue}</p> : null}
      <p className="mt-1">Що неузгоджено: {sourceContext}</p>
      <p className="mt-2 font-semibold">Де це впливає у формулах:</p>
      <div className="mt-1 space-y-1">
        {usedInFormulas.map(item => (
          <p key={item}>• {item}</p>
        ))}
      </div>
    </div>
  );
}

function ZoneSection({
  id,
  title,
  subtitle,
  expanded,
  onToggle,
  children,
  navigation,
  panelClassName = "mb-6",
  headerClassName = "p-5 md:p-7",
  contentClassName = "p-5 md:p-7"
}: ZoneSectionProps) {
  const regionId = `${id}-content`;
  const handleHeaderKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onToggle();
    }
  };

  return (
    <section id={id} className={["panel overflow-hidden", panelClassName].join(" ")}>
      <div
        className={[
          "w-full cursor-pointer select-none text-left transition hover:bg-slate-50/70",
          headerClassName
        ].join(" ")}
        onClick={onToggle}
        onKeyDown={handleHeaderKeyDown}
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        aria-controls={regionId}
        aria-label={`${expanded ? "Collapse" : "Expand"} ${title}`}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="zone-title">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
          </div>
          <div className="inline-flex shrink-0 items-center text-lg leading-none text-slate-500">
            <span>{expanded ? "▾" : "▸"}</span>
          </div>
        </div>
      </div>
      {expanded ? (
        <div id={regionId} className={contentClassName}>
          {children}
          {navigation ? (
            <div className="mt-6 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => navigation.onNavigate(navigation.start.id)}
                aria-label={`Back to start from ${title}`}
                className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 sm:w-auto"
              >
                Back to start
              </button>
              <button
                type="button"
                onClick={() => navigation.onNavigate(navigation.previous.id)}
                aria-label={`Back to previous zone from ${title}: ${navigation.previous.title}`}
                className="inline-flex w-full items-center justify-center rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-900 transition hover:border-blue-400 hover:bg-blue-100 sm:w-auto"
              >
                Back to previous zone
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default function App() {
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
  const [payoutMinimumFeePerTransaction, setPayoutMinimumFeePerTransaction] =
    useState(DEFAULT_CALCULATOR_STATE.payoutMinimumFeePerTransaction);
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
  const setPayinRegionModel = (
    region: "eu" | "ww",
    model: PricingModelType
  ) => {
    if (region === "eu") {
      setPayinEuPricing(current => ({ ...current, model }));
      return;
    }
    setPayinWwPricing(current => ({ ...current, model }));
  };
  const setPayinRegionRateMode = (
    region: "eu" | "ww",
    rateMode: PricingRateMode
  ) => {
    if (region === "eu") {
      setPayinEuPricing(current => ({ ...current, rateMode }));
      return;
    }
    setPayinWwPricing(current => ({ ...current, rateMode }));
  };
  const setPayinRegionTrxEnabled = (
    region: "eu" | "ww",
    enabled: boolean
  ) => {
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
    const zones: ZoneNavigationTarget[] = [
      { id: "zone0", title: "Zone 0: Calculator Type" }
    ];

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

  const payin = useMemo(
    () =>
      derivePayinTraffic({
        monthlyVolume: payinVolume,
        successfulTransactions: payinTransactions,
        approvalRatioPercent,
        euPercent,
        ccPercent
      }),
    [approvalRatioPercent, ccPercent, euPercent, payinTransactions, payinVolume]
  );

  const payout = useMemo(
    () =>
      derivePayoutTraffic({
        monthlyVolume: payoutVolume,
        totalTransactions: payoutTransactions
      }),
    [payoutTransactions, payoutVolume]
  );

  const introducerBaseVolume = useMemo(
    () => (calculatorType.payin ? payin.normalized.monthlyVolume : 0),
    [calculatorType.payin, payin.normalized.monthlyVolume]
  );

  const standardIntroducer = useMemo(
    () => calculateStandardIntroducerCommission(introducerBaseVolume),
    [introducerBaseVolume]
  );

  const customIntroducer = useMemo(
    () =>
      calculateCustomIntroducerCommission(introducerBaseVolume, {
        tier1UpToMillion: customTier1UpToMillion,
        tier2UpToMillion: customTier2UpToMillion,
        tier1RatePerMillion: Math.max(0, customTier1RatePerMillion),
        tier2RatePerMillion: Math.max(0, customTier2RatePerMillion),
        tier3RatePerMillion: Math.max(0, customTier3RatePerMillion)
      }),
    [
      customTier1RatePerMillion,
      customTier1UpToMillion,
      customTier2RatePerMillion,
      customTier2UpToMillion,
      customTier3RatePerMillion,
      introducerBaseVolume
    ]
  );

  const payinEuPreview = useMemo(
    () =>
      calculatePayinRegionPricingPreview({
        volume: payin.volume.eu,
        averageTransaction: payin.averageTransaction,
        successful: {
          cc: payin.successful.byRegionMethod.euCc,
          apm: payin.successful.byRegionMethod.euApm
        },
        methodVolume: {
          cc: payin.volume.byRegionMethod.euCc,
          apm: payin.volume.byRegionMethod.euApm
        },
        config: payinEuPricing
      }),
    [payin.averageTransaction, payin.successful.byRegionMethod.euApm, payin.successful.byRegionMethod.euCc, payin.volume.byRegionMethod.euApm, payin.volume.byRegionMethod.euCc, payin.volume.eu, payinEuPricing]
  );
  const payinWwPreview = useMemo(
    () =>
      calculatePayinRegionPricingPreview({
        volume: payin.volume.ww,
        averageTransaction: payin.averageTransaction,
        successful: {
          cc: payin.successful.byRegionMethod.wwCc,
          apm: payin.successful.byRegionMethod.wwApm
        },
        methodVolume: {
          cc: payin.volume.byRegionMethod.wwCc,
          apm: payin.volume.byRegionMethod.wwApm
        },
        config: payinWwPricing
      }),
    [payin.averageTransaction, payin.successful.byRegionMethod.wwApm, payin.successful.byRegionMethod.wwCc, payin.volume.byRegionMethod.wwApm, payin.volume.byRegionMethod.wwCc, payin.volume.ww, payinWwPricing]
  );
  const payoutPreview = useMemo(
    () =>
      calculatePayoutPricingPreview({
        volume: payout.normalized.monthlyVolume,
        averageTransaction: payout.averageTransaction,
        totalTransactions: payout.normalized.totalTransactions,
        config: payoutPricing
      }),
    [payout.averageTransaction, payout.normalized.monthlyVolume, payout.normalized.totalTransactions, payoutPricing]
  );
  const payoutRateMinimumAdjustments = useMemo(
    () =>
      payoutPreview.minimumAdjustments.filter(
        adjustment => adjustment.mdrMinimumApplied || adjustment.trxMinimumApplied
      ),
    [payoutPreview.minimumAdjustments]
  );
  const payoutSingleRateMinimumAdjustment = payoutPreview.singleRateMinimumAdjustment;
  const payinBaseRevenue = useMemo(
    () =>
      calculatorType.payin
        ? payinEuPreview.totalRevenue + payinWwPreview.totalRevenue
        : 0,
    [calculatorType.payin, payinEuPreview.totalRevenue, payinWwPreview.totalRevenue]
  );
  const payoutBaseRevenue = useMemo(
    () => (calculatorType.payout ? payoutPreview.totalRevenue : 0),
    [calculatorType.payout, payoutPreview.totalRevenue]
  );
  const payinEffectiveTrxFeesByRegion = useMemo(() => {
    const euCcFee = resolveEffectiveMethodTrxFee(payinEuPricing, payinEuPreview, "cc");
    const euApmFee = resolveEffectiveMethodTrxFee(
      payinEuPricing,
      payinEuPreview,
      "apm"
    );
    const wwCcFee = resolveEffectiveMethodTrxFee(payinWwPricing, payinWwPreview, "cc");
    const wwApmFee = resolveEffectiveMethodTrxFee(
      payinWwPricing,
      payinWwPreview,
      "apm"
    );
    return {
      eu: { ccFee: euCcFee, apmFee: euApmFee },
      ww: { ccFee: wwCcFee, apmFee: wwApmFee }
    };
  }, [
    payinEuPreview,
    payinEuPricing,
    payinWwPreview,
    payinWwPricing
  ]);
  const effectiveFailedTrxFees = useMemo(() => {
    const euFailedCc = payin.failed.byRegionMethod.euCc;
    const wwFailedCc = payin.failed.byRegionMethod.wwCc;
    const euFailedApm = payin.failed.byRegionMethod.euApm;
    const wwFailedApm = payin.failed.byRegionMethod.wwApm;
    const totalFailedCc = euFailedCc + wwFailedCc;
    const totalFailedApm = euFailedApm + wwFailedApm;

    return {
      ccFee:
        totalFailedCc > 0
          ? (payinEffectiveTrxFeesByRegion.eu.ccFee * euFailedCc +
              payinEffectiveTrxFeesByRegion.ww.ccFee * wwFailedCc) /
            totalFailedCc
          : 0,
      apmFee:
        totalFailedApm > 0
          ? (payinEffectiveTrxFeesByRegion.eu.apmFee * euFailedApm +
              payinEffectiveTrxFeesByRegion.ww.apmFee * wwFailedApm) /
            totalFailedApm
          : 0
    };
  }, [
    payin.failed.byRegionMethod.euApm,
    payin.failed.byRegionMethod.euCc,
    payin.failed.byRegionMethod.wwApm,
    payin.failed.byRegionMethod.wwCc,
    payinEffectiveTrxFeesByRegion.eu.apmFee,
    payinEffectiveTrxFeesByRegion.eu.ccFee,
    payinEffectiveTrxFeesByRegion.ww.apmFee,
    payinEffectiveTrxFeesByRegion.ww.ccFee
  ]);
  const payoutMinimumFeeImpact = useMemo(
    () =>
      calculatePayoutMinimumFeeImpact({
        config: {
          enabled: payoutMinimumFeeEnabled,
          minimumFeePerTransaction: payoutMinimumFeePerTransaction
        },
        payoutTransactions: calculatorType.payout
          ? payout.normalized.totalTransactions
          : 0,
        payoutRevenue: payoutBaseRevenue
      }),
    [
      calculatorType.payout,
      payout.normalized.totalTransactions,
      payoutBaseRevenue,
      payoutMinimumFeeEnabled,
      payoutMinimumFeePerTransaction
    ]
  );
  const threeDsImpact = useMemo(
    () =>
      calculateThreeDsImpact({
        config: {
          enabled: threeDsEnabled,
          revenuePerSuccessfulTransaction: threeDsRevenuePerSuccessfulTransaction,
          providerCostPerAttempt: DEFAULT_3DS_FEE_CONFIG.providerCostPerAttempt
        },
        successfulTransactions: calculatorType.payin ? payin.successful.total : 0,
        totalAttempts: calculatorType.payin ? payin.attempts.total : 0
      }),
    [
      calculatorType.payin,
      payin.attempts.total,
      payin.successful.total,
      threeDsEnabled,
      threeDsRevenuePerSuccessfulTransaction
    ]
  );
  const threeDsPayinRegionalBreakdown = useMemo(() => {
    const revenuePerSuccessful = Math.max(0, threeDsRevenuePerSuccessfulTransaction);
    const providerCostPerAttempt = DEFAULT_3DS_FEE_CONFIG.providerCostPerAttempt;
    const payinEnabled = calculatorType.payin;
    const buildRegion = (successfulTransactions: number, attempts: number) => {
      const revenue =
        payinEnabled && threeDsEnabled
          ? successfulTransactions * revenuePerSuccessful
          : 0;
      const cost = payinEnabled ? attempts * providerCostPerAttempt : 0;

      return {
        successfulTransactions,
        attempts,
        revenue,
        cost,
        net: revenue - cost
      };
    };

    const eu = buildRegion(payin.successful.eu, payin.attempts.eu);
    const ww = buildRegion(payin.successful.ww, payin.attempts.ww);

    return {
      eu,
      ww,
      total: {
        revenue: eu.revenue + ww.revenue,
        cost: eu.cost + ww.cost,
        net: eu.net + ww.net
      }
    };
  }, [
    calculatorType.payin,
    payin.attempts.eu,
    payin.attempts.ww,
    payin.successful.eu,
    payin.successful.ww,
    threeDsEnabled,
    threeDsRevenuePerSuccessfulTransaction
  ]);
  const settlementFeeImpact = useMemo(
    () =>
      calculateSettlementFeeImpact({
        config: {
          enabled: settlementFeeEnabled,
          ratePercent: settlementFeeRatePercent
        },
        settlementIncludedInPricing: settlementIncluded,
        payinVolume: calculatorType.payin ? payin.normalized.monthlyVolume : 0,
        payoutVolume: calculatorType.payout ? payout.normalized.monthlyVolume : 0,
        payinFeesAll: payinBaseRevenue + threeDsImpact.revenue,
        payoutFeesAll: payoutBaseRevenue
      }),
    [
      calculatorType.payin,
      calculatorType.payout,
      payin.normalized.monthlyVolume,
      payout.normalized.monthlyVolume,
      payinBaseRevenue,
      payoutBaseRevenue,
      settlementFeeEnabled,
      settlementFeeRatePercent,
      settlementIncluded,
      threeDsImpact.revenue
    ]
  );
  const monthlyMinimumFeeImpact = useMemo(
    () =>
      calculateMonthlyMinimumFeeImpact({
        config: {
          enabled: monthlyMinimumFeeEnabled,
          minimumMonthlyRevenue: monthlyMinimumFeeAmount
        },
        actualRevenue: payinBaseRevenue + payoutBaseRevenue
      }),
    [
      monthlyMinimumFeeAmount,
      monthlyMinimumFeeEnabled,
      payinBaseRevenue,
      payoutBaseRevenue
    ]
  );
  const failedTrxImpact = useMemo(
    () =>
      calculateFailedTrxImpact({
        config: {
          enabled: failedTrxEnabled,
          mode: failedTrxMode,
          overLimitThresholdPercent: failedTrxOverLimitThresholdPercent
        },
        successfulTransactions: payin.successful.total,
        totalAttempts: payin.attempts.total,
        failedCcTransactions: payin.failed.cc,
        failedApmTransactions: payin.failed.apm,
        trxCcFee: effectiveFailedTrxFees.ccFee,
        trxApmFee: effectiveFailedTrxFees.apmFee
      }),
    [
      effectiveFailedTrxFees.apmFee,
      effectiveFailedTrxFees.ccFee,
      failedTrxEnabled,
      failedTrxMode,
      failedTrxOverLimitThresholdPercent,
      payin.attempts.total,
      payin.failed.apm,
      payin.failed.cc,
      payin.successful.total
    ]
  );
  const failedTrxRevenueByRegion = useMemo(() => {
    if (!calculatorType.payin || !failedTrxEnabled || failedTrxMode !== "allFailedVolume") {
      return { eu: 0, ww: 0 };
    }

    const eu =
      payin.failed.byRegionMethod.euCc * payinEffectiveTrxFeesByRegion.eu.ccFee +
      payin.failed.byRegionMethod.euApm * payinEffectiveTrxFeesByRegion.eu.apmFee;
    const ww =
      payin.failed.byRegionMethod.wwCc * payinEffectiveTrxFeesByRegion.ww.ccFee +
      payin.failed.byRegionMethod.wwApm * payinEffectiveTrxFeesByRegion.ww.apmFee;

    return { eu, ww };
  }, [
    calculatorType.payin,
    failedTrxEnabled,
    failedTrxMode,
    payin.failed.byRegionMethod.euApm,
    payin.failed.byRegionMethod.euCc,
    payin.failed.byRegionMethod.wwApm,
    payin.failed.byRegionMethod.wwCc,
    payinEffectiveTrxFeesByRegion.eu.apmFee,
    payinEffectiveTrxFeesByRegion.eu.ccFee,
    payinEffectiveTrxFeesByRegion.ww.apmFee,
    payinEffectiveTrxFeesByRegion.ww.ccFee
  ]);
  const payoutRevenueAdjusted = useMemo(
    () => (calculatorType.payout ? payoutMinimumFeeImpact.adjustedRevenue : 0),
    [calculatorType.payout, payoutMinimumFeeImpact.adjustedRevenue]
  );
  const payoutTrxRevenueAdjusted = useMemo(
    () =>
      Math.max(
        0,
        payoutRevenueAdjusted - (calculatorType.payout ? payoutPreview.mdrRevenue : 0)
      ),
    [calculatorType.payout, payoutPreview.mdrRevenue, payoutRevenueAdjusted]
  );
  const payinProfitability = useMemo(
    () =>
      calculatePayinProfitability({
        eu: {
          volume: calculatorType.payin ? payin.volume.eu : 0,
          mdrRevenue: calculatorType.payin ? payinEuPreview.mdrRevenue : 0,
          trxRevenue: calculatorType.payin ? payinEuPreview.trxRevenue : 0,
          failedTrxRevenue: failedTrxRevenueByRegion.eu,
          attemptsCcTransactions: calculatorType.payin ? payin.attempts.byRegionMethod.euCc : 0,
          attemptsApmTransactions: calculatorType.payin ? payin.attempts.byRegionMethod.euApm : 0,
          pricingModel: payinEuPricing.model,
          schemeFeesPercent: payinEuPricing.schemeFeesPercent,
          interchangePercent: payinEuPricing.interchangePercent,
          providerTrxCcCost: DEFAULT_PROVIDER_PAYIN_TRX_CC_COST,
          providerTrxApmCost: DEFAULT_PROVIDER_PAYIN_TRX_APM_COST
        },
        ww: {
          volume: calculatorType.payin ? payin.volume.ww : 0,
          mdrRevenue: calculatorType.payin ? payinWwPreview.mdrRevenue : 0,
          trxRevenue: calculatorType.payin ? payinWwPreview.trxRevenue : 0,
          failedTrxRevenue: failedTrxRevenueByRegion.ww,
          attemptsCcTransactions: calculatorType.payin ? payin.attempts.byRegionMethod.wwCc : 0,
          attemptsApmTransactions: calculatorType.payin ? payin.attempts.byRegionMethod.wwApm : 0,
          pricingModel: payinWwPricing.model,
          schemeFeesPercent: payinWwPricing.schemeFeesPercent,
          interchangePercent: payinWwPricing.interchangePercent,
          providerTrxCcCost: DEFAULT_PROVIDER_PAYIN_TRX_CC_COST,
          providerTrxApmCost: DEFAULT_PROVIDER_PAYIN_TRX_APM_COST
        }
      }),
    [
      calculatorType.payin,
      failedTrxRevenueByRegion.eu,
      failedTrxRevenueByRegion.ww,
      payin.attempts.byRegionMethod.euApm,
      payin.attempts.byRegionMethod.euCc,
      payin.attempts.byRegionMethod.wwApm,
      payin.attempts.byRegionMethod.wwCc,
      payin.volume.eu,
      payin.volume.ww,
      payinEuPreview.mdrRevenue,
      payinEuPreview.trxRevenue,
      payinEuPricing.interchangePercent,
      payinEuPricing.model,
      payinEuPricing.schemeFeesPercent,
      payinWwPreview.mdrRevenue,
      payinWwPreview.trxRevenue,
      payinWwPricing.interchangePercent,
      payinWwPricing.model,
      payinWwPricing.schemeFeesPercent
    ]
  );
  const payoutProfitability = useMemo(
    () =>
      calculatePayoutProfitability({
        volume: calculatorType.payout ? payout.normalized.monthlyVolume : 0,
        totalTransactions: calculatorType.payout ? payout.normalized.totalTransactions : 0,
        mdrRevenue: calculatorType.payout ? payoutPreview.mdrRevenue : 0,
        trxRevenue: payoutTrxRevenueAdjusted
      }),
    [
      calculatorType.payout,
      payout.normalized.monthlyVolume,
      payout.normalized.totalTransactions,
      payoutPreview.mdrRevenue,
      payoutTrxRevenueAdjusted
    ]
  );
  const otherRevenueProfitability = useMemo(
    () =>
      calculateOtherRevenueProfitability({
        threeDsRevenue: threeDsImpact.revenue,
        threeDsCost: threeDsImpact.cost,
        settlementFeeRevenue: -settlementFeeImpact.fee,
        monthlyMinimumAdjustment: monthlyMinimumFeeImpact.upliftRevenue
      }),
    [
      monthlyMinimumFeeImpact.upliftRevenue,
      settlementFeeImpact.fee,
      threeDsImpact.cost,
      threeDsImpact.revenue
    ]
  );
  const revShareIntroducer = useMemo(
    () =>
      calculateRevShareIntroducerCommission({
        totalRevenue: payinProfitability.revenue.total,
        totalCosts: payinProfitability.costs.total,
        sharePercent: revSharePercent
      }),
    [
      payinProfitability.costs.total,
      payinProfitability.revenue.total,
      revSharePercent
    ]
  );
  const selectedIntroducerCommissionAmount = useMemo(() => {
    if (introducerCommissionType === "standard") {
      return standardIntroducer.totalCommission;
    }
    if (introducerCommissionType === "custom") {
      return customIntroducer.totalCommission;
    }
    return revShareIntroducer.partnerShare;
  }, [
    customIntroducer.totalCommission,
    introducerCommissionType,
    revShareIntroducer.partnerShare,
    standardIntroducer.totalCommission
  ]);
  const introducerCommissionAmount = introducerEnabled ? selectedIntroducerCommissionAmount : 0;
  const totalProfitability = useMemo(
    () =>
      calculateTotalProfitability({
        payin: payinProfitability,
        payout: payoutProfitability,
        other: otherRevenueProfitability,
        introducerEnabled,
        introducerCommissionType,
        introducerCommissionAmount: selectedIntroducerCommissionAmount,
        revSharePercent
      }),
    [
      introducerCommissionAmount,
      introducerEnabled,
      introducerCommissionType,
      otherRevenueProfitability,
      payinProfitability,
      payoutProfitability,
      selectedIntroducerCommissionAmount,
      revSharePercent
    ]
  );
  const hasCommissionBaseAmbiguity =
    false;
  const hasSchemeFeesIcPlusAmbiguityEu = false;
  const hasSchemeFeesIcPlusAmbiguityWw = false;
  const hasThreeDsBaseAmbiguity = false;
  const hasAnySchemeIcPlusAmbiguity =
    hasSchemeFeesIcPlusAmbiguityEu || hasSchemeFeesIcPlusAmbiguityWw;
  const euTrxRevenueCc = useMemo(
    () =>
      resolveMethodTrxRevenue(
        payinEuPricing,
        payinEuPreview,
        payin.successful.byRegionMethod.euCc,
        "cc"
      ),
    [payin.successful.byRegionMethod.euCc, payinEuPreview, payinEuPricing]
  );
  const euTrxRevenueApm = useMemo(
    () =>
      resolveMethodTrxRevenue(
        payinEuPricing,
        payinEuPreview,
        payin.successful.byRegionMethod.euApm,
        "apm"
      ),
    [payin.successful.byRegionMethod.euApm, payinEuPreview, payinEuPricing]
  );
  const wwTrxRevenueCc = useMemo(
    () =>
      resolveMethodTrxRevenue(
        payinWwPricing,
        payinWwPreview,
        payin.successful.byRegionMethod.wwCc,
        "cc"
      ),
    [payin.successful.byRegionMethod.wwCc, payinWwPreview, payinWwPricing]
  );
  const wwTrxRevenueApm = useMemo(
    () =>
      resolveMethodTrxRevenue(
        payinWwPricing,
        payinWwPreview,
        payin.successful.byRegionMethod.wwApm,
        "apm"
      ),
    [payin.successful.byRegionMethod.wwApm, payinWwPreview, payinWwPricing]
  );
  const unifiedProfitabilityTree = useMemo<UnifiedProfitabilityNode[]>(() => {
    const nodes: UnifiedProfitabilityNode[] = [];

    const totalChildren: UnifiedProfitabilityNode[] =
      introducerEnabled && introducerCommissionType === "revShare"
        ? [
            {
              id: "unified-total-revenue",
              label: "Total Revenue",
              value: totalProfitability.totalRevenue,
              formula: `Total Revenue = Payin Revenue (${formatAmount2(
                payinProfitability.revenue.total
              )}) + Payout Revenue (${formatAmount2(
                payoutProfitability.revenue.total
              )}) + Other Revenue (${formatAmount2(otherRevenueProfitability.revenue.total)})`
            },
            {
              id: "unified-total-costs",
              label: "Total Costs",
              value: -totalProfitability.totalCosts,
              formula: `Total Costs = Payin Costs (${formatAmount2(
                payinProfitability.costs.total
              )}) + Payout Costs (${formatAmount2(
                payoutProfitability.costs.total
              )}) + Other Costs (${formatAmount2(otherRevenueProfitability.costs.total)})`
            },
            {
              id: "unified-margin-before-split",
              label: "Margin Before Split",
              value: totalProfitability.marginBeforeIntroducer,
              formula: `Margin Before Split = Total Revenue (${formatAmount2(
                totalProfitability.totalRevenue
              )}) - Total Costs (${formatAmount2(totalProfitability.totalCosts)})`
            },
            {
              id: "unified-introducer-revshare",
              label: `Introducer Commission (${formatInputNumber(
                totalProfitability.revSharePercentApplied
              )}%)`,
              value: -totalProfitability.introducerCommission,
              formula: `Introducer Commission = Payin Net Margin (${formatAmount2(
                totalProfitability.payinNetMargin
              )}) × ${formatInputNumber(totalProfitability.revSharePercentApplied)}%`
            },
            {
              id: "unified-our-margin",
              label: "Our Margin",
              value: totalProfitability.ourMargin,
              formula: `Our Margin = Margin Before Split (${formatAmount2(
                totalProfitability.marginBeforeIntroducer
              )}) - Introducer Commission (${formatAmount2(
                totalProfitability.introducerCommission
              )})`
            }
          ]
        : [
            {
              id: "unified-payin-net",
              label: "Payin Net Margin",
              value: totalProfitability.payinNetMargin,
              formula: `Payin Net Margin = Total Payin Revenue (${formatAmount2(
                payinProfitability.revenue.total
              )}) - Total Payin Costs (${formatAmount2(payinProfitability.costs.total)})`
            },
            {
              id: "unified-payout-net",
              label: "Payout Net Margin",
              value: totalProfitability.payoutNetMargin,
              formula: `Payout Net Margin = Total Payout Revenue (${formatAmount2(
                payoutProfitability.revenue.total
              )}) - Total Payout Costs (${formatAmount2(payoutProfitability.costs.total)})`
            },
            {
              id: "unified-total-other-net-margin",
              label: "Other Revenue",
              value: totalProfitability.otherNetMargin,
              formula: `Other Revenue = 3DS Revenue (${formatAmount2(
                otherRevenueProfitability.revenue.threeDs
              )}) - 3DS Costs (${formatAmount2(
                otherRevenueProfitability.costs.threeDs
              )}) - Settlement Fee (${formatAmount2(
                Math.abs(otherRevenueProfitability.revenue.settlementFee)
              )}) + Monthly Minimum Adj (${formatAmount2(
                otherRevenueProfitability.revenue.monthlyMinimumAdjustment
              )})`
            },
            {
              id: "unified-total-margin",
              label: "Total Margin",
              value: totalProfitability.marginBeforeIntroducer,
              formula: `Total Margin = Payin Net (${formatAmount2(
                totalProfitability.payinNetMargin
              )}) + Payout Net (${formatAmount2(
                totalProfitability.payoutNetMargin
              )}) + Other Revenue (${formatAmount2(totalProfitability.otherNetMargin)})`
            },
            {
              id: "unified-introducer",
              label: "Introducer Commission",
              value: -totalProfitability.introducerCommission,
              formula: introducerEnabled
                ? `Introducer Commission = Zone 2 Commission (${formatAmount2(
                    totalProfitability.introducerCommission
                  )})`
                : "Introducer Commission = 0 because Agent / Introducer is not enabled"
            },
          {
            id: "unified-our-margin",
            label: "Our Margin",
            value: totalProfitability.ourMargin,
            formula: `Our Margin = Total Margin (${formatAmount2(
              totalProfitability.marginBeforeIntroducer
            )}) - Introducer Commission (${formatAmount2(
              totalProfitability.introducerCommission
            )})`
          }
        ];

    const buildPayinCostChildren = (
      regionKey: "eu" | "ww",
      regionLabel: "EU" | "WW",
      pricing: PayinRegionPricingConfig,
      volume: number
    ): UnifiedProfitabilityNode[] => {
      const regionProfitability =
        regionKey === "eu" ? payinProfitability.eu : payinProfitability.ww;
      const isBlended = pricing.model === "blended";

      const children: UnifiedProfitabilityNode[] = [
        ...regionProfitability.providerMdrRows.map((row, index) => ({
          id: `unified-payin-${regionKey}-provider-mdr-tier-${index}`,
          label: `Provider MDR ${row.label} (${regionLabel})`,
          value: -row.cost,
          formula: `${formatAmountInteger(row.volume)} × ${formatInputNumber(
            row.ratePercent
          )}% = ${formatAmount2(row.cost)}`
        })),
        {
          id: `unified-payin-${regionKey}-provider-trx-cc`,
          label: `Provider TRX CC (${regionLabel})`,
          value: -regionProfitability.providerTrxBreakdown.ccCost,
          formula: `${formatCount(
            regionProfitability.providerTrxBreakdown.attemptsCc
          )} attempts × ${formatAmount2(DEFAULT_PROVIDER_PAYIN_TRX_CC_COST)} = ${formatAmount2(
            regionProfitability.providerTrxBreakdown.ccCost
          )}`
        },
        {
          id: `unified-payin-${regionKey}-provider-trx-apm`,
          label: `Provider TRX APM (${regionLabel})`,
          value: -regionProfitability.providerTrxBreakdown.apmCost,
          formula: `${formatCount(
            regionProfitability.providerTrxBreakdown.attemptsApm
          )} attempts × ${formatAmount2(DEFAULT_PROVIDER_PAYIN_TRX_APM_COST)} = ${formatAmount2(
            regionProfitability.providerTrxBreakdown.apmCost
          )}`
        }
      ];

      if (!isBlended) return children;

      children.push(
        {
          id: `unified-payin-${regionKey}-scheme-fees`,
          label: `Scheme Fees (${regionLabel}, Blended)`,
          value: -regionProfitability.costs.schemeFees,
          formula: `${formatAmountInteger(volume)} × ${formatInputNumber(
            pricing.schemeFeesPercent
          )}% = ${formatAmount2(regionProfitability.costs.schemeFees)}`
        },
        {
          id: `unified-payin-${regionKey}-interchange`,
          label: `Interchange (${regionLabel}, Blended fixed cost)`,
          value: -regionProfitability.costs.interchange,
          formula: `${formatAmountInteger(volume)} × fixed ${formatInputNumber(
            pricing.interchangePercent
          )}% = ${formatAmount2(regionProfitability.costs.interchange)}`
        }
      );

      return children;
    };

    const buildPayinCostFormula = (
      regionLabel: "EU" | "WW",
      profitability: typeof payinProfitability.eu,
      pricing: PayinRegionPricingConfig
    ): string => {
      const parts = [
        `Provider MDR (${formatAmount2(profitability.costs.providerMdr)})`,
        `Provider TRX (${formatAmount2(profitability.costs.providerTrx)})`
      ];

      if (pricing.model === "blended") {
        parts.push(`Scheme Fees (${formatAmount2(profitability.costs.schemeFees)})`);
        parts.push(`Interchange (${formatAmount2(profitability.costs.interchange)})`);
      }

      return `${regionLabel} Costs = ${parts.join(" + ")}`;
    };

    nodes.push({
      id: "unified-total-profitability",
      label: "TOTAL PROFITABILITY",
      value: totalProfitability.ourMargin,
      formula: `Final Profitability Result = Our Margin (${formatAmount2(totalProfitability.ourMargin)})`,
      children: totalChildren
    });

    if (calculatorType.payin) {
      nodes.push({
        id: "unified-payin-root",
        label: "Payin Revenue & Costs",
        value: payinProfitability.netMargin,
        formula: `Payin Net Margin = Total Payin Revenue (${formatAmount2(
          payinProfitability.revenue.total
        )}) - Total Payin Costs (${formatAmount2(payinProfitability.costs.total)})`,
        children: [
          {
            id: "unified-payin-total-revenue",
            label: "Total Payin Revenue",
            value: payinProfitability.revenue.total,
            formula: `Total Payin Revenue = MDR (${formatAmount2(
              payinProfitability.revenue.mdr
            )}) + TRX (${formatAmount2(payinProfitability.revenue.trx)}) + Failed TRX (${formatAmount2(
              payinProfitability.revenue.failedTrx
            )})`,
            children: [
              {
                id: "unified-payin-eu-revenue",
                label: "EU Revenue",
                value: payinProfitability.eu.revenue.total,
                formula: `EU Revenue = EU MDR (${formatAmount2(
                  payinEuPreview.mdrRevenue
                )}) + EU TRX (${formatAmount2(payinEuPreview.trxRevenue)}) + EU Failed TRX (${formatAmount2(
                  failedTrxRevenueByRegion.eu
                )})`,
                children: [
                  {
                    id: "unified-payin-eu-mdr-revenue",
                    label: "MDR Revenue (EU)",
                    value: payinEuPreview.mdrRevenue,
                    formula: `${formatAmountInteger(payin.volume.eu)} × ${formatInputNumber(
                      payinEuPricing.rateMode === "single"
                        ? payinEuPricing.single.mdrPercent
                        : payinEuPreview.mdrRevenue > 0
                          ? (payinEuPreview.mdrRevenue / Math.max(payin.volume.eu, 1)) * 100
                          : 0
                    )}%`
                  },
                  {
                    id: "unified-payin-eu-trx-cc",
                    label: "TRX Revenue CC (EU)",
                    value: euTrxRevenueCc,
                    formula: `${formatCount(
                      payin.successful.byRegionMethod.euCc
                    )} trx × effective CC fee = ${formatAmount2(euTrxRevenueCc)}`
                  },
                  {
                    id: "unified-payin-eu-trx-apm",
                    label: "TRX Revenue APM (EU)",
                    value: euTrxRevenueApm,
                    formula: `${formatCount(
                      payin.successful.byRegionMethod.euApm
                    )} trx × effective APM fee = ${formatAmount2(euTrxRevenueApm)}`
                  },
                  {
                    id: "unified-payin-eu-failed-trx",
                    label: "Failed TRX Revenue (EU)",
                    value: failedTrxRevenueByRegion.eu,
                    formula: `Failed CC/APM in EU charged by effective TRX fees (${formatAmount2(
                      failedTrxRevenueByRegion.eu
                    )})`
                  }
                ]
              },
              {
                id: "unified-payin-ww-revenue",
                label: "WW Revenue",
                value: payinProfitability.ww.revenue.total,
                formula: `WW Revenue = WW MDR (${formatAmount2(
                  payinWwPreview.mdrRevenue
                )}) + WW TRX (${formatAmount2(payinWwPreview.trxRevenue)}) + WW Failed TRX (${formatAmount2(
                  failedTrxRevenueByRegion.ww
                )})`,
                children: [
                  {
                    id: "unified-payin-ww-mdr-revenue",
                    label: "MDR Revenue (WW)",
                    value: payinWwPreview.mdrRevenue,
                    formula: `${formatAmountInteger(payin.volume.ww)} × ${formatInputNumber(
                      payinWwPricing.rateMode === "single"
                        ? payinWwPricing.single.mdrPercent
                        : payinWwPreview.mdrRevenue > 0
                          ? (payinWwPreview.mdrRevenue / Math.max(payin.volume.ww, 1)) * 100
                          : 0
                    )}%`
                  },
                  {
                    id: "unified-payin-ww-trx-cc",
                    label: "TRX Revenue CC (WW)",
                    value: wwTrxRevenueCc,
                    formula: `${formatCount(
                      payin.successful.byRegionMethod.wwCc
                    )} trx × effective CC fee = ${formatAmount2(wwTrxRevenueCc)}`
                  },
                  {
                    id: "unified-payin-ww-trx-apm",
                    label: "TRX Revenue APM (WW)",
                    value: wwTrxRevenueApm,
                    formula: `${formatCount(
                      payin.successful.byRegionMethod.wwApm
                    )} trx × effective APM fee = ${formatAmount2(wwTrxRevenueApm)}`
                  },
                  {
                    id: "unified-payin-ww-failed-trx",
                    label: "Failed TRX Revenue (WW)",
                    value: failedTrxRevenueByRegion.ww,
                    formula: `Failed CC/APM in WW charged by effective TRX fees (${formatAmount2(
                      failedTrxRevenueByRegion.ww
                    )})`
                  }
                ]
              },
              {
                id: "unified-payin-eu-3ds-revenue",
                label: "3DS Revenue (EU)",
                value: threeDsPayinRegionalBreakdown.eu.revenue,
                formula: `3DS Revenue (EU) = Successful Payin EU Transactions (${formatCount(
                  threeDsPayinRegionalBreakdown.eu.successfulTransactions
                )}) × 3DS Revenue per Successful (${formatAmount2(
                  threeDsRevenuePerSuccessfulTransaction
                )})`
              },
              {
                id: "unified-payin-ww-3ds-revenue",
                label: "3DS Revenue (WW)",
                value: threeDsPayinRegionalBreakdown.ww.revenue,
                formula: `3DS Revenue (WW) = Successful Payin WW Transactions (${formatCount(
                  threeDsPayinRegionalBreakdown.ww.successfulTransactions
                )}) × 3DS Revenue per Successful (${formatAmount2(
                  threeDsRevenuePerSuccessfulTransaction
                )})`
              }
            ]
          },
          {
            id: "unified-payin-total-costs",
            label: "Total Payin Costs",
            value: -payinProfitability.costs.total,
            formula: `Total Payin Costs = EU Costs (${formatAmount2(
              payinProfitability.eu.costs.total
            )}) + WW Costs (${formatAmount2(payinProfitability.ww.costs.total)}) = ${formatAmount2(
              payinProfitability.costs.total
            )}`,
            children: [
              {
                id: "unified-payin-eu-costs",
                label: "EU Costs",
                value: -payinProfitability.eu.costs.total,
                formula: buildPayinCostFormula("EU", payinProfitability.eu, payinEuPricing),
                children: buildPayinCostChildren("eu", "EU", payinEuPricing, payin.volume.eu)
              },
              {
                id: "unified-payin-ww-costs",
                label: "WW Costs",
                value: -payinProfitability.ww.costs.total,
                formula: buildPayinCostFormula("WW", payinProfitability.ww, payinWwPricing),
                children: buildPayinCostChildren("ww", "WW", payinWwPricing, payin.volume.ww)
              },
              {
                id: "unified-payin-eu-3ds-cost",
                label: "3DS Costs (EU)",
                value: -threeDsPayinRegionalBreakdown.eu.cost,
                formula: `3DS Costs (EU) = EU Payin Attempts (${formatCount(
                  threeDsPayinRegionalBreakdown.eu.attempts
                )}) × Provider 3DS Cost per Attempt (${formatAmount2(
                  DEFAULT_3DS_FEE_CONFIG.providerCostPerAttempt
                )})`
              },
              {
                id: "unified-payin-ww-3ds-cost",
                label: "3DS Costs (WW)",
                value: -threeDsPayinRegionalBreakdown.ww.cost,
                formula: `3DS Costs (WW) = WW Payin Attempts (${formatCount(
                  threeDsPayinRegionalBreakdown.ww.attempts
                )}) × Provider 3DS Cost per Attempt (${formatAmount2(
                  DEFAULT_3DS_FEE_CONFIG.providerCostPerAttempt
                )})`
              }
            ]
          }
        ]
      });
    }

    if (calculatorType.payout) {
      nodes.push({
        id: "unified-payout-root",
        label: "Payout Revenue & Costs",
        value: payoutProfitability.netMargin,
        children: [
          {
            id: "unified-payout-total-revenue",
            label: payoutMinimumFeeImpact.warning
              ? "Total Payout Revenue (Minimum Applied)"
              : "Total Payout Revenue",
            value: payoutProfitability.revenue.total,
            formula: payoutMinimumFeeImpact.warning
              ? `Total Payout Revenue (minimum applied) = max(Base Payout Revenue (${formatAmount2(
                  payoutMinimumFeeImpact.baseRevenue
                )}), Minimum Per-TRX (${formatAmount2(
                  payoutMinimumFeeImpact.appliedPerTransactionRevenue
                )}) × Transactions (${formatCount(
                  payout.normalized.totalTransactions
                )})) = ${formatAmount2(payoutProfitability.revenue.total)}`
              : `Total Payout Revenue = MDR (${formatAmount2(
                  payoutProfitability.revenue.mdr
                )}) + TRX (${formatAmount2(payoutProfitability.revenue.trx)})`
          },
          {
            id: "unified-payout-total-costs",
            label: "Total Payout Costs",
            value: -payoutProfitability.costs.total,
            formula: `Total Payout Costs = Provider MDR (${formatAmount2(
              payoutProfitability.costs.providerMdr
            )}) + Provider TRX (${formatAmount2(payoutProfitability.costs.providerTrx)})`,
            children: payoutProfitability.providerMdrRows.map((row, index) => ({
              id: `unified-payout-provider-mdr-tier-${index}`,
              label: `Provider MDR ${row.label} (Payout)`,
              value: -row.cost,
              formula: `${formatAmountInteger(row.volume)} × ${formatInputNumber(
                row.ratePercent
              )}% = ${formatAmount2(row.cost)}`
            }))
          },
          {
            id: "unified-payout-net-margin",
            label: "Payout Net Margin",
            value: payoutProfitability.netMargin,
            formula: `Payout Net Margin = Total Payout Revenue (${formatAmount2(
              payoutProfitability.revenue.total
            )}) - Total Payout Costs (${formatAmount2(payoutProfitability.costs.total)})`
          }
        ]
      });
    }

    nodes.push({
      id: "unified-other-revenue-root",
      label: "Other Revenue",
      value: otherRevenueProfitability.netMargin,
      formula: `Other Revenue = Payin 3DS Net (${formatAmount2(
        threeDsPayinRegionalBreakdown.total.net
      )}) - Settlement Fee (${formatAmount2(
        Math.abs(otherRevenueProfitability.revenue.settlementFee)
      )}) + Monthly Minimum Adj (${formatAmount2(
        otherRevenueProfitability.revenue.monthlyMinimumAdjustment
      )})`,
      children: [
        {
          id: "unified-other-settlement-fee",
          label: "Settlement Fee (Deduction)",
          value: otherRevenueProfitability.revenue.settlementFee,
          formula: `Settlement Fee Deduction = Chargeable Net (${formatAmount2(
            settlementFeeImpact.chargeableNet
          )}) × Settlement Rate (${formatInputNumber(settlementFeeRatePercent)}%) = -${formatAmount2(
            settlementFeeImpact.fee
          )}`
        },
        {
          id: "unified-other-monthly-minimum",
          label: "Monthly Minimum Adjustment",
          value: otherRevenueProfitability.revenue.monthlyMinimumAdjustment,
          formula: monthlyMinimumFeeImpact.warning
            ? `Monthly Minimum Adj (minimum applied) = Applied Monthly Revenue (${formatAmount2(
                monthlyMinimumFeeImpact.appliedRevenue
              )}) - Actual Revenue (${formatAmount2(
                monthlyMinimumFeeImpact.baseRevenue
              )}) = ${formatAmount2(otherRevenueProfitability.revenue.monthlyMinimumAdjustment)}`
            : `Monthly Minimum Adj = max(0, Minimum (${formatAmount2(
                monthlyMinimumFeeAmount
              )}) - Actual Revenue (${formatAmount2(monthlyMinimumFeeImpact.baseRevenue)}))`
        }
      ]
    });

    nodes.push({
      id: "unified-introducer-root",
      label: "Introducer Commission",
      value: -introducerCommissionAmount,
      formula: !introducerEnabled
        ? "Introducer Commission = 0 because Agent / Introducer is not enabled"
        : introducerCommissionType === "revShare"
          ? `Rev Share (Payin only) = (Payin Revenue (${formatAmount2(
              revShareIntroducer.totalRevenue
            )}) - Payin Costs (${formatAmount2(revShareIntroducer.totalCosts)})) × ${formatInputNumber(
              revShareIntroducer.sharePercent
            )}%`
          : `Commission = ${formatAmount2(introducerCommissionAmount)} from Zone 2 (${
              introducerCommissionType === "standard" ? "Standard" : "Custom"
            })`
    });

    return nodes;
  }, [
    calculatorType.payin,
    calculatorType.payout,
    euTrxRevenueApm,
    euTrxRevenueCc,
    failedTrxRevenueByRegion.eu,
    failedTrxRevenueByRegion.ww,
    introducerEnabled,
    introducerCommissionAmount,
    introducerCommissionType,
    monthlyMinimumFeeAmount,
    monthlyMinimumFeeImpact.appliedRevenue,
    monthlyMinimumFeeImpact.baseRevenue,
    otherRevenueProfitability.costs.threeDs,
    otherRevenueProfitability.netMargin,
    otherRevenueProfitability.revenue.monthlyMinimumAdjustment,
    otherRevenueProfitability.revenue.settlementFee,
    otherRevenueProfitability.revenue.threeDs,
    payin.successful.byRegionMethod.euApm,
    payin.successful.byRegionMethod.euCc,
    payin.successful.byRegionMethod.wwApm,
    payin.successful.byRegionMethod.wwCc,
    payin.attempts.total,
    payin.successful.total,
    payin.volume.eu,
    payin.volume.ww,
    payinEuPreview.mdrRevenue,
    payinEuPreview.trxRevenue,
    payinEuPricing.interchangePercent,
    payinEuPricing.model,
    payinEuPricing.rateMode,
    payinEuPricing.schemeFeesPercent,
    payinEuPricing.single.mdrPercent,
    payinProfitability.costs.interchange,
    payinProfitability.costs.providerMdr,
    payinProfitability.costs.providerTrx,
    payinProfitability.costs.schemeFees,
    payinProfitability.costs.total,
    payinProfitability.eu.costs.interchange,
    payinProfitability.eu.costs.providerMdr,
    payinProfitability.eu.costs.providerTrx,
    payinProfitability.eu.costs.schemeFees,
    payinProfitability.eu.costs.total,
    payinProfitability.eu.providerMdrRows,
    payinProfitability.eu.providerTrxBreakdown.apmCost,
    payinProfitability.eu.providerTrxBreakdown.attemptsApm,
    payinProfitability.eu.providerTrxBreakdown.attemptsCc,
    payinProfitability.eu.providerTrxBreakdown.ccCost,
    payinProfitability.eu.revenue.total,
    payinProfitability.netMargin,
    payinProfitability.revenue.failedTrx,
    payinProfitability.revenue.mdr,
    payinProfitability.revenue.total,
    payinProfitability.revenue.trx,
    payinProfitability.ww.costs.interchange,
    payinProfitability.ww.costs.providerMdr,
    payinProfitability.ww.costs.providerTrx,
    payinProfitability.ww.costs.schemeFees,
    payinProfitability.ww.costs.total,
    payinProfitability.ww.providerMdrRows,
    payinProfitability.ww.providerTrxBreakdown.apmCost,
    payinProfitability.ww.providerTrxBreakdown.attemptsApm,
    payinProfitability.ww.providerTrxBreakdown.attemptsCc,
    payinProfitability.ww.providerTrxBreakdown.ccCost,
    payinProfitability.ww.revenue.total,
    payinWwPreview.mdrRevenue,
    payinWwPreview.trxRevenue,
    payinWwPricing.interchangePercent,
    payinWwPricing.model,
    payinWwPricing.rateMode,
    payinWwPricing.schemeFeesPercent,
    payinWwPricing.single.mdrPercent,
    payoutProfitability.costs.providerMdr,
    payoutProfitability.costs.providerTrx,
    payoutProfitability.costs.total,
    payoutProfitability.netMargin,
    payoutProfitability.providerMdrRows,
    payoutProfitability.revenue.mdr,
    payoutProfitability.revenue.total,
    payoutProfitability.revenue.trx,
    payout.normalized.totalTransactions,
    payoutMinimumFeeImpact.appliedPerTransactionRevenue,
    payoutMinimumFeeImpact.baseRevenue,
    payoutMinimumFeeImpact.warning,
    revShareIntroducer.sharePercent,
    revShareIntroducer.totalCosts,
    revShareIntroducer.totalRevenue,
    settlementFeeImpact.chargeableNet,
    settlementFeeRatePercent,
    threeDsPayinRegionalBreakdown,
    threeDsRevenuePerSuccessfulTransaction,
    totalProfitability.introducerCommission,
    totalProfitability.marginBeforeIntroducer,
    totalProfitability.otherNetMargin,
    totalProfitability.ourMargin,
    totalProfitability.payinNetMargin,
    totalProfitability.payoutNetMargin,
    totalProfitability.revSharePercentApplied,
    totalProfitability.totalCosts,
    totalProfitability.totalRevenue,
    wwTrxRevenueApm,
    wwTrxRevenueCc
  ]);
  const unifiedExpandableNodeIds = useMemo(
    () => collectExpandableNodeIds(unifiedProfitabilityTree),
    [unifiedProfitabilityTree]
  );
  useEffect(() => {
    setUnifiedExpandedById(current => {
      const next: Record<string, boolean> = {};
      for (const id of unifiedExpandableNodeIds) {
        next[id] = id in current ? current[id] : true;
      }
      return next;
    });
  }, [unifiedExpandableNodeIds]);

  const expandAllUnifiedRows = () => {
    setUnifiedExpandedById(
      unifiedExpandableNodeIds.reduce<Record<string, boolean>>((acc, id) => {
        acc[id] = true;
        return acc;
      }, {})
    );
  };

  const collapseAllUnifiedRows = () => {
    setUnifiedExpandedById(
      unifiedExpandableNodeIds.reduce<Record<string, boolean>>((acc, id) => {
        acc[id] = false;
        return acc;
      }, {})
    );
  };

  const toggleUnifiedRow = (id: string) => {
    setUnifiedExpandedById(current => ({
      ...current,
      [id]: !(current[id] ?? true)
    }));
  };

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

  return (
    <main className="min-h-screen">
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8 md:py-10">
        <header className="panel mb-6 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-cyan-700 px-6 py-8 text-white md:px-8">
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-blue-100">
              BSG Pricing Workspace
            </p>
            <h1 className="text-3xl font-extrabold tracking-tight md:text-5xl">
              Calculator v4
            </h1>
            <p className="mt-3 max-w-3xl text-base text-blue-50 md:text-lg">
              Zone 0/1 foundation with clear Payin and Payout separation, dynamic
              recalculation, and production-style readable input layout.
            </p>
          </div>
        </header>

        <section
          aria-label="Calculator actions"
          className="panel mb-6 flex flex-col gap-3 p-5 sm:flex-row sm:justify-end md:p-7"
        >
          <button
            type="button"
            onClick={resetAllValuesToZero}
            className="inline-flex w-full items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 sm:w-auto"
          >
            Reset all to 0
          </button>
          <button
            type="button"
            onClick={applyDefaultValues}
            className="inline-flex w-full items-center justify-center rounded-xl border border-blue-500 bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 sm:w-auto"
          >
            Apply defaults
          </button>
        </section>

        <ZoneSection
          id="zone0"
          title="Zone 0: Calculator Type"
          subtitle="At least one mode is always enabled. You can run Payin and Payout together."
          expanded={zoneExpanded.zone0}
          onToggle={() => toggleZone("zone0")}
          contentClassName="px-5 pb-5 md:px-7 md:pb-7"
        >
          <div className="flex flex-wrap gap-3">
            <ModeToggle
              label="Payin"
              checked={calculatorType.payin}
              onChange={setPayinEnabled}
            />
            <ModeToggle
              label="Payout"
              checked={calculatorType.payout}
              onChange={setPayoutEnabled}
            />
          </div>
        </ZoneSection>

        {calculatorType.payin ? (
          <ZoneSection
            id="zone1a"
            title="Zone 1A: Payin Traffic Input"
            subtitle="Core traffic data and split configuration for Payin calculations."
            expanded={zoneExpanded.zone1a}
            onToggle={() => toggleZone("zone1a")}
            navigation={getZoneNavigation("zone1a")}
            headerClassName="border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-cyan-50 px-5 py-4 md:px-7"
            contentClassName="p-5 md:p-7"
          >
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-lg font-bold text-slate-800">Traffic Base</h3>
                <div className="mt-4 grid gap-4">
                  <NumberField
                    label="Monthly Payin Volume (€)"
                    value={payinVolume}
                    onChange={setPayinVolume}
                    step={50_000}
                    helper={`Formatted: ${formatAmountInteger(payinVolume)}`}
                  />
                  <NumberField
                    label="Successful Payin Transactions"
                    value={payinTransactions}
                    onChange={setPayinTransactions}
                    step={100}
                    helper={`Count: ${formatCount(payinTransactions)}`}
                  />
                  <NumberField
                    label="Payin Approval Ratio (%)"
                    value={approvalRatioPercent}
                    onChange={setApprovalRatioPercent}
                    min={0}
                    max={100}
                    step={1}
                    helper="Used to derive attempts and failed transactions."
                  />
                  <NumberField
                    label="Average Transaction (€) - Auto"
                    value={payin.averageTransaction}
                    onChange={() => undefined}
                    readOnly
                    helper={`Average Transaction = Rounded Monthly Payin Volume (${formatAmountInteger(
                      payin.normalized.monthlyVolume
                    )}) / Successful Payin Transactions (${formatCount(
                      payin.normalized.successfulTransactions
                    )}) = ${formatAmount2(payin.averageTransaction)}`}
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-lg font-bold text-slate-800">Split Controls</h3>
                <div className="mt-4 grid gap-4">
                  <NumberField
                    label="EU Split (%)"
                    value={euPercent}
                    onChange={handleEuChange}
                    min={0}
                    max={100}
                    step={5}
                    helper={`EU Volume = Rounded Monthly Payin Volume (${formatAmountInteger(
                      payin.volume.total
                    )}) × EU Split (${formatInputNumber(payin.normalized.euPercent)}%) = ${formatAmount2(
                      payin.volume.eu
                    )}`}
                  />
                  <NumberField
                    label="WW Split (%)"
                    value={wwPercent}
                    onChange={handleWwChange}
                    min={0}
                    max={100}
                    step={5}
                    helper={`WW Volume = Rounded Monthly Payin Volume (${formatAmountInteger(
                      payin.volume.total
                    )}) × WW Split (${formatInputNumber(payin.normalized.wwPercent)}%) = ${formatAmount2(
                      payin.volume.ww
                    )}`}
                  />
                  <NumberField
                    label="CC Split (%)"
                    value={ccPercent}
                    onChange={handleCcChange}
                    min={0}
                    max={100}
                    step={5}
                    helper={`CC Volume = Rounded Monthly Payin Volume (${formatAmountInteger(
                      payin.volume.total
                    )}) × CC Split (${formatInputNumber(payin.normalized.ccPercent)}%) = ${formatAmount2(
                      payin.volume.cc
                    )}`}
                  />
                  <NumberField
                    label="APM Split (%)"
                    value={apmPercent}
                    onChange={handleApmChange}
                    min={0}
                    max={100}
                    step={5}
                    helper={`APM Volume = Rounded Monthly Payin Volume (${formatAmountInteger(
                      payin.volume.total
                    )}) × APM Split (${formatInputNumber(
                      payin.normalized.apmPercent
                    )}%) = ${formatAmount2(payin.volume.apm)}`}
                  />
                </div>
              </div>
            </div>
          </ZoneSection>
        ) : null}

        {calculatorType.payout ? (
          <ZoneSection
            id="zone1b"
            title="Zone 1B: Payout Traffic Input"
            subtitle="Dedicated input section for Payout flow data."
            expanded={zoneExpanded.zone1b}
            onToggle={() => toggleZone("zone1b")}
            navigation={getZoneNavigation("zone1b")}
            headerClassName="border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-sky-50 px-5 py-4 md:px-7"
            contentClassName="p-5 md:p-7"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <NumberField
                label="Monthly Payout Volume (€)"
                value={payoutVolume}
                onChange={setPayoutVolume}
                step={50_000}
                helper={`Formatted: ${formatAmountInteger(payoutVolume)}`}
              />
              <NumberField
                label="Total Payout Transactions"
                value={payoutTransactions}
                onChange={setPayoutTransactions}
                step={100}
                helper={`Count: ${formatCount(payoutTransactions)}`}
              />
              <NumberField
                label="Average Transaction (€) - Auto"
                value={payout.averageTransaction}
                onChange={() => undefined}
                readOnly
                helper={`Average Transaction = Rounded Monthly Payout Volume (${formatAmountInteger(
                  payout.normalized.monthlyVolume
                )}) / Total Payout Transactions (${formatCount(
                  payout.normalized.totalTransactions
                )}) = ${formatAmount2(payout.averageTransaction)}`}
              />
            </div>
          </ZoneSection>
        ) : null}

        <ZoneSection
          id="zone2"
          title="Zone 2: Introducer Commission"
          subtitle="Configure partner commission model: Standard, Custom, or Rev Share."
          expanded={zoneExpanded.zone2}
          onToggle={() => toggleZone("zone2")}
          navigation={getZoneNavigation("zone2")}
          headerClassName="border-b border-slate-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-5 py-4 md:px-7"
          contentClassName="p-5 md:p-7"
        >
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-lg font-bold text-slate-800">Commission Model</h3>
              <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                <input
                  className="h-4 w-4 accent-blue-600"
                  type="checkbox"
                  checked={introducerEnabled}
                  onChange={event => setIntroducerEnabled(event.target.checked)}
                />
                Agent / Introducer
              </label>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <CommissionModeCard
                  label="Standard"
                  description="Single retrospective tier applied to full volume."
                  selected={introducerCommissionType === "standard"}
                  onSelect={() => setIntroducerCommissionType("standard")}
                />
                <CommissionModeCard
                  label="Custom"
                  description="Progressive tier model with configurable boundaries."
                  selected={introducerCommissionType === "custom"}
                  onSelect={() => setIntroducerCommissionType("custom")}
                />
                <CommissionModeCard
                  label="Rev Share"
                  description="Partner gets percentage from margin after costs."
                  selected={introducerCommissionType === "revShare"}
                  onSelect={() => setIntroducerCommissionType("revShare")}
                />
              </div>

              <div className="mt-4 grid gap-4">
                <div
                  className={
                    hasCommissionBaseAmbiguity
                      ? "rounded-xl border border-rose-300 bg-rose-50/40 p-3"
                      : ""
                  }
                >
                  <NumberField
                    label="Commission Base Volume (€) - Auto"
                    value={introducerBaseVolume}
                    onChange={() => undefined}
                    readOnly
                    helper={`Commission Base Volume = Payin Volume Only (${formatAmountInteger(
                      calculatorType.payin ? payin.normalized.monthlyVolume : 0
                    )}) = ${formatAmountInteger(introducerBaseVolume)}`}
                  />
                </div>
                {hasCommissionBaseAmbiguity ? (
                  <SpecAmbiguityNotice
                    title="База обсягу для Introducer Commission (Standard/Custom)"
                    currentValue={formatAmountInteger(introducerBaseVolume)}
                    sourceContext="DOCX не фіксує однозначно, від чого брати базу обсягу: тільки Payin, тільки Payout чи суму Payin + Payout."
                    usedInFormulas={[
                      "Zone 2 Standard: Total Introducer Commission = Commission Base Volume × Applied Tier Rate",
                      "Zone 2 Custom: розбиття по тірах залежить від Commission Base Volume",
                      "Zone 5: Our Margin = Total Margin - Introducer Commission"
                    ]}
                  />
                ) : null}
              </div>

              {introducerCommissionType === "custom" ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h4 className="text-base font-bold text-slate-800">Custom Tier Settings</h4>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <NumberField
                      label="Tier 1 Up To (M)"
                      value={customTier1UpToMillion}
                      onChange={handleCustomTier1UpToChange}
                      min={0}
                      step={1}
                    />
                    <NumberField
                      label="Tier 2 Up To (M)"
                      value={customTier2UpToMillion}
                      onChange={handleCustomTier2UpToChange}
                      min={customTier1UpToMillion}
                      step={1}
                    />
                    <NumberField
                      label="Tier 1 Rate (%)"
                      value={customTier1RatePerMillion / 10_000}
                      onChange={value =>
                        setCustomTier1RatePerMillion(Math.max(0, value) * 10_000)
                      }
                      min={0}
                      step={0.01}
                    />
                    <NumberField
                      label="Tier 2 Rate (%)"
                      value={customTier2RatePerMillion / 10_000}
                      onChange={value =>
                        setCustomTier2RatePerMillion(Math.max(0, value) * 10_000)
                      }
                      min={0}
                      step={0.01}
                    />
                    <NumberField
                      label="Tier 3 Rate (%)"
                      value={customTier3RatePerMillion / 10_000}
                      onChange={value =>
                        setCustomTier3RatePerMillion(Math.max(0, value) * 10_000)
                      }
                      min={0}
                      step={0.01}
                    />
                  </div>
                </div>
              ) : null}

              {introducerCommissionType === "revShare" ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h4 className="text-base font-bold text-slate-800">Rev Share Settings</h4>
                  <div className="mt-3 grid gap-3">
                    <NumberField
                      label="Total Revenue (€)"
                      value={revShareIntroducer.totalRevenue}
                      onChange={() => undefined}
                      readOnly
                      helper="Auto from Zone 5 (Payin only): Total Payin Revenue."
                    />
                    <NumberField
                      label="Total Costs (€)"
                      value={revShareIntroducer.totalCosts}
                      onChange={() => undefined}
                      readOnly
                      helper="Auto from Zone 5 (Payin only): Total Payin Costs."
                    />
                    <NumberField
                      label="Partner Share (%) [0-50]"
                      value={revSharePercent}
                      onChange={handleRevSharePercentChange}
                      min={0}
                      max={50}
                      step={5}
                    />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-lg font-bold text-slate-800">Formula Breakdown</h3>
              {introducerCommissionType === "standard" ? (
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="font-semibold text-slate-800">Standard Tiers</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Retrospective model: one selected tier applies to full volume.
                    </p>
                    <div className="mt-2 space-y-2">
                      {DEFAULT_STANDARD_TIERS.map(tier => {
                        const isApplied = tier.label === standardIntroducer.appliedTier.label;
                        return (
                          <div
                            key={tier.label}
                            className={[
                              "rounded-md border px-3 py-2",
                              isApplied
                                ? "border-emerald-300 bg-emerald-50"
                                : "border-slate-200 bg-white"
                            ].join(" ")}
                          >
                            <p className="font-semibold text-slate-800">{tier.label}</p>
                            <p className="text-xs text-slate-600">
                              {formatAmountInteger(tier.ratePerMillion)} per €1M
                            </p>
                            <p className="text-xs text-slate-500">
                              = {formatInputNumber(tier.ratePerMillion / 10_000)}% of volume
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <p>
                    Applied Tier: <strong>{standardIntroducer.appliedTier.label}</strong>
                  </p>
                  <p>
                    Formula:{" "}
                    <strong>
                      {formatMillion(standardIntroducer.volumeMillion)} ×{" "}
                      {formatAmountInteger(standardIntroducer.appliedTier.ratePerMillion)} per €1M
                    </strong>
                  </p>
                  <div className="space-y-2">
                    <MetricCard
                      name="Total Introducer Commission"
                      value={formatAmount2(standardIntroducer.totalCommission)}
                    />
                    <p
                      className={[
                        "rounded-lg border px-3 py-2 text-xs",
                        hasCommissionBaseAmbiguity
                          ? "border-rose-300 bg-rose-50 text-rose-900"
                          : "border-slate-200 bg-slate-50 text-slate-600"
                      ].join(" ")}
                    >
                      Formula: Total Introducer Commission = Commission Base Volume (
                      {formatMillion(standardIntroducer.volumeMillion)}) × Applied Tier Rate (
                      {formatAmountInteger(standardIntroducer.appliedTier.ratePerMillion)} per €1M)
                      = {formatAmount2(standardIntroducer.totalCommission)}
                    </p>
                  </div>
                </div>
              ) : null}

              {introducerCommissionType === "custom" ? (
                <div className="mt-4 space-y-3 text-sm text-slate-700">
                  {customIntroducer.tiers.map((row, index) => (
                    <div
                      key={`${row.tier.label}-${index}`}
                      className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                    >
                      <p className="font-semibold text-slate-800">{row.tier.label}</p>
                      <p>
                        {formatAmountInteger(row.volumeMillionInTier * 1_000_000)} ×{" "}
                        {formatInputNumber(row.tier.ratePerMillion / 10_000)}% ={" "}
                        <strong>{formatAmount2(row.commission)}</strong>
                      </p>
                    </div>
                  ))}
                  <div className="space-y-2">
                    <MetricCard
                      name="Total Introducer Commission"
                      value={formatAmount2(customIntroducer.totalCommission)}
                    />
                    <p
                      className={[
                        "rounded-lg border px-3 py-2 text-xs",
                        hasCommissionBaseAmbiguity
                          ? "border-rose-300 bg-rose-50 text-rose-900"
                          : "border-slate-200 bg-slate-50 text-slate-600"
                      ].join(" ")}
                    >
                      Formula: Total Introducer Commission = Tier 1 Commission (
                      {formatAmount2(customIntroducer.tiers[0].commission)}) + Tier 2 Commission (
                      {formatAmount2(customIntroducer.tiers[1].commission)}) + Tier 3 Commission (
                      {formatAmount2(customIntroducer.tiers[2].commission)}) ={" "}
                      {formatAmount2(customIntroducer.totalCommission)}
                    </p>
                  </div>
                </div>
              ) : null}

              {introducerCommissionType === "revShare" ? (
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <MetricCard
                      name="Payin Margin Before Split"
                      value={formatAmount2(revShareIntroducer.marginBeforeSplit)}
                    />
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      Formula: Payin Margin Before Split = Payin Revenue (
                      {formatAmount2(revShareIntroducer.totalRevenue)}) - Payin Costs (
                      {formatAmount2(revShareIntroducer.totalCosts)}) ={" "}
                      {formatAmount2(revShareIntroducer.marginBeforeSplit)}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <MetricCard
                      name={`Partner Share (${formatInputNumber(revShareIntroducer.sharePercent)}%)`}
                      value={formatAmount2(revShareIntroducer.partnerShare)}
                    />
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      Formula: Partner Share = Payin Margin Before Split (
                      {formatAmount2(revShareIntroducer.marginBeforeSplit)}) × Partner Share % (
                      {formatInputNumber(revShareIntroducer.sharePercent)}%) ={" "}
                      {formatAmount2(revShareIntroducer.partnerShare)}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <MetricCard
                      name="Our Margin After Share"
                      value={formatAmount2(revShareIntroducer.ourMargin)}
                    />
                    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      Formula: Our Margin After Share = Payin Margin Before Split (
                      {formatAmount2(revShareIntroducer.marginBeforeSplit)}) - Partner Share (
                      {formatAmount2(revShareIntroducer.partnerShare)}) ={" "}
                      {formatAmount2(revShareIntroducer.ourMargin)}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </ZoneSection>

        <ZoneSection
          id="zone3"
          title="Zone 3: Pricing Configuration"
          subtitle="Configure Payin/Payout pricing models and rate sets (IC++ / Blended, Single / Tiered)."
          expanded={zoneExpanded.zone3}
          onToggle={() => toggleZone("zone3")}
          navigation={getZoneNavigation("zone3")}
          headerClassName="border-b border-slate-200 bg-gradient-to-r from-amber-50 to-orange-50 px-5 py-4 md:px-7"
          contentClassName="p-5 md:p-7"
        >
          <div className="grid gap-6">
            <div className="flex justify-end">
              <FormulaVisibilityToggle
                scopeLabel="Zone 3"
                showFormulas={showZone3Formulas}
                onToggle={() => setShowZone3Formulas(current => !current)}
              />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-lg font-bold text-slate-800">General Settings</h3>
              <div className="mt-4">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                  <input
                    className="h-4 w-4 accent-blue-600"
                    type="checkbox"
                    checked={settlementIncluded}
                    onChange={event => setSettlementIncluded(event.target.checked)}
                  />
                  Settlement Included
                </label>
                <p className="mt-2 text-xs text-slate-600">
                  If unchecked, Settlement Fee settings become active in Zone 4.
                </p>
                {showZone3Formulas ? (
                  <div className="mt-3">
                    <FormulaLine>
                      Formula: Settlement Included ={" "}
                      <strong>{settlementIncluded ? "ON" : "OFF"}</strong>. When OFF, Settlement Fee
                      section should be shown in Zone 4.
                    </FormulaLine>
                  </div>
                ) : null}
              </div>
            </div>

            {calculatorType.payin ? (
              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-lg font-bold text-slate-800">Payin EU Pricing</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Input basis: EU volume {formatAmountInteger(payin.volume.eu)}, successful EU
                    CC/APM {formatCount(payin.successful.byRegionMethod.euCc)} /{" "}
                    {formatCount(payin.successful.byRegionMethod.euApm)}.
                  </p>
                  <div className="mt-4 grid gap-3">
                    <div>
                      <span className="field-label">Pricing Model</span>
                      <div className="flex flex-wrap gap-2">
                        <MiniToggle
                          label="IC++"
                          selected={payinEuPricing.model === "icpp"}
                          onSelect={() => setPayinRegionModel("eu", "icpp")}
                          ariaLabel="Payin EU model IC++"
                        />
                        <MiniToggle
                          label="Blended"
                          selected={payinEuPricing.model === "blended"}
                          onSelect={() => setPayinRegionModel("eu", "blended")}
                          ariaLabel="Payin EU model Blended"
                        />
                      </div>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                      <input
                        className="h-4 w-4 accent-blue-600"
                        type="checkbox"
                        checked={payinEuPricing.trxFeeEnabled}
                        onChange={event => setPayinRegionTrxEnabled("eu", event.target.checked)}
                      />
                      TRX Fee Enabled
                    </label>
                    <div>
                      <span className="field-label">Rate Type</span>
                      <div className="flex flex-wrap gap-2">
                        <MiniToggle
                          label="Single Rate"
                          selected={payinEuPricing.rateMode === "single"}
                          onSelect={() => setPayinRegionRateMode("eu", "single")}
                          ariaLabel="Payin EU single rate"
                        />
                        <MiniToggle
                          label="Tiered Rates"
                          selected={payinEuPricing.rateMode === "tiered"}
                          onSelect={() => setPayinRegionRateMode("eu", "tiered")}
                          ariaLabel="Payin EU tiered rates"
                        />
                      </div>
                    </div>
                    {payinEuPricing.rateMode === "single" ? (
                      <div className="grid gap-3 md:grid-cols-3">
                        <NumberField
                          label="MDR (%)"
                          value={payinEuPricing.single.mdrPercent}
                          onChange={value => setPayinRegionSingleField("eu", "mdrPercent", value)}
                          min={0}
                          max={10}
                          step={0.05}
                        />
                        <NumberField
                          label="TRX CC (€)"
                          value={payinEuPricing.single.trxCc}
                          onChange={value => setPayinRegionSingleField("eu", "trxCc", value)}
                          min={0}
                          step={0.01}
                        />
                        <NumberField
                          label="TRX APM (€)"
                          value={payinEuPricing.single.trxApm}
                          onChange={value => setPayinRegionSingleField("eu", "trxApm", value)}
                          min={0}
                          step={0.01}
                        />
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <NumberField
                            label="Tier 1 Up To (M)"
                            value={payinEuPricing.tier1UpToMillion}
                            onChange={value => setPayinRegionTierBoundary("eu", "tier1UpToMillion", value)}
                            min={0}
                            max={25}
                            step={1}
                          />
                          <NumberField
                            label="Tier 2 Up To (M)"
                            value={payinEuPricing.tier2UpToMillion}
                            onChange={value => setPayinRegionTierBoundary("eu", "tier2UpToMillion", value)}
                            min={payinEuPricing.tier1UpToMillion}
                            max={25}
                            step={1}
                          />
                        </div>
                        {payinEuPricing.tiers.map((tier, index) => (
                          <div
                            key={`payin-eu-tier-${index}`}
                            className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                          >
                            <p className="text-sm font-bold text-slate-700">Tier {index + 1}</p>
                            <div className="mt-2 grid gap-3 md:grid-cols-3">
                              <NumberField
                                label="MDR (%)"
                                value={tier.mdrPercent}
                                onChange={value =>
                                  setPayinRegionTierField(
                                    "eu",
                                    index as 0 | 1 | 2,
                                    "mdrPercent",
                                    value
                                  )
                                }
                                min={0}
                                max={10}
                                step={0.05}
                              />
                              <NumberField
                                label="TRX CC (€)"
                                value={tier.trxCc}
                                onChange={value =>
                                  setPayinRegionTierField(
                                    "eu",
                                    index as 0 | 1 | 2,
                                    "trxCc",
                                    value
                                  )
                                }
                                min={0}
                                step={0.01}
                              />
                              <NumberField
                                label="TRX APM (€)"
                                value={tier.trxApm}
                                onChange={value =>
                                  setPayinRegionTierField(
                                    "eu",
                                    index as 0 | 1 | 2,
                                    "trxApm",
                                    value
                                  )
                                }
                                min={0}
                                step={0.01}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {payinEuPreview.warnings.length > 0 ? (
                      <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                        {payinEuPreview.warnings.map(warning => (
                          <p key={warning}>{warning}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h4 className="text-base font-bold text-slate-800">Formula Breakdown (EU)</h4>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                      <MetricCard name="MDR Revenue" value={formatAmount2(payinEuPreview.mdrRevenue)} />
                      <MetricCard name="TRX Revenue" value={formatAmount2(payinEuPreview.trxRevenue)} />
                      <MetricCard name="Total Revenue" value={formatAmount2(payinEuPreview.totalRevenue)} />
                    </div>
                    {showZone3Formulas ? (
                      <div className="mt-3 space-y-2">
                        {payinEuPricing.rateMode === "single" ? (
                          <>
                            <FormulaLine>
                              Formula: MDR Revenue = EU Volume ({formatAmountInteger(payin.volume.eu)}) ×
                              MDR ({formatInputNumber(payinEuPricing.single.mdrPercent)}%) ={" "}
                              {formatAmount2(
                                payin.volume.eu * (payinEuPricing.single.mdrPercent / 100)
                              )}
                            </FormulaLine>
                            <FormulaLine>
                              Formula: TRX Revenue ={" "}
                              {payinEuPricing.trxFeeEnabled
                                ? `Successful EU CC (${formatCount(
                                    payin.successful.byRegionMethod.euCc
                                  )}) × TRX CC (${formatAmount2(
                                    payinEuPricing.single.trxCc
                                  )}) + Successful EU APM (${formatCount(
                                    payin.successful.byRegionMethod.euApm
                                  )}) × TRX APM (${formatAmount2(
                                    payinEuPricing.single.trxApm
                                  )})`
                                : "TRX disabled"}
                              {" = "}
                              {formatAmount2(payinEuPreview.trxRevenue)}
                            </FormulaLine>
                          </>
                        ) : (
                          <>
                            {payinEuPreview.tierRows.map(row => (
                              <FormulaLine key={`payin-eu-breakdown-${row.label}`}>
                                {row.label}: Volume {formatAmountInteger(row.volume)} × MDR{" "}
                                {formatInputNumber(row.mdrPercent)}% = {formatAmount2(row.mdrRevenue)};
                                TRX = ({formatInputNumber(row.ccTransactions)} CC trx ×{" "}
                                {formatAmount2(row.trxCc)}) + ({formatInputNumber(row.apmTransactions)}{" "}
                                APM trx × {formatAmount2(row.trxApm)}) ={" "}
                                {formatAmount2(row.trxRevenue)}
                              </FormulaLine>
                            ))}
                          </>
                        )}
                        <FormulaLine>
                          Formula: Total Revenue = MDR Revenue ({formatAmount2(payinEuPreview.mdrRevenue)}) +
                          TRX Revenue ({formatAmount2(payinEuPreview.trxRevenue)}) ={" "}
                          {formatAmount2(payinEuPreview.totalRevenue)}
                        </FormulaLine>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h3 className="text-lg font-bold text-slate-800">Payin WW Pricing</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    Input basis: WW volume {formatAmountInteger(payin.volume.ww)}, successful WW
                    CC/APM {formatCount(payin.successful.byRegionMethod.wwCc)} /{" "}
                    {formatCount(payin.successful.byRegionMethod.wwApm)}.
                  </p>
                  <div className="mt-4 grid gap-3">
                    <div>
                      <span className="field-label">Pricing Model</span>
                      <div className="flex flex-wrap gap-2">
                        <MiniToggle
                          label="IC++"
                          selected={payinWwPricing.model === "icpp"}
                          onSelect={() => setPayinRegionModel("ww", "icpp")}
                          ariaLabel="Payin WW model IC++"
                        />
                        <MiniToggle
                          label="Blended"
                          selected={payinWwPricing.model === "blended"}
                          onSelect={() => setPayinRegionModel("ww", "blended")}
                          ariaLabel="Payin WW model Blended"
                        />
                      </div>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                      <input
                        className="h-4 w-4 accent-blue-600"
                        type="checkbox"
                        checked={payinWwPricing.trxFeeEnabled}
                        onChange={event => setPayinRegionTrxEnabled("ww", event.target.checked)}
                      />
                      TRX Fee Enabled
                    </label>
                    <div>
                      <span className="field-label">Rate Type</span>
                      <div className="flex flex-wrap gap-2">
                        <MiniToggle
                          label="Single Rate"
                          selected={payinWwPricing.rateMode === "single"}
                          onSelect={() => setPayinRegionRateMode("ww", "single")}
                          ariaLabel="Payin WW single rate"
                        />
                        <MiniToggle
                          label="Tiered Rates"
                          selected={payinWwPricing.rateMode === "tiered"}
                          onSelect={() => setPayinRegionRateMode("ww", "tiered")}
                          ariaLabel="Payin WW tiered rates"
                        />
                      </div>
                    </div>
                    {payinWwPricing.rateMode === "single" ? (
                      <div className="grid gap-3 md:grid-cols-3">
                        <NumberField
                          label="MDR (%)"
                          value={payinWwPricing.single.mdrPercent}
                          onChange={value => setPayinRegionSingleField("ww", "mdrPercent", value)}
                          min={0}
                          max={10}
                          step={0.05}
                        />
                        <NumberField
                          label="TRX CC (€)"
                          value={payinWwPricing.single.trxCc}
                          onChange={value => setPayinRegionSingleField("ww", "trxCc", value)}
                          min={0}
                          step={0.01}
                        />
                        <NumberField
                          label="TRX APM (€)"
                          value={payinWwPricing.single.trxApm}
                          onChange={value => setPayinRegionSingleField("ww", "trxApm", value)}
                          min={0}
                          step={0.01}
                        />
                      </div>
                    ) : (
                      <div className="grid gap-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <NumberField
                            label="Tier 1 Up To (M)"
                            value={payinWwPricing.tier1UpToMillion}
                            onChange={value => setPayinRegionTierBoundary("ww", "tier1UpToMillion", value)}
                            min={0}
                            max={25}
                            step={1}
                          />
                          <NumberField
                            label="Tier 2 Up To (M)"
                            value={payinWwPricing.tier2UpToMillion}
                            onChange={value => setPayinRegionTierBoundary("ww", "tier2UpToMillion", value)}
                            min={payinWwPricing.tier1UpToMillion}
                            max={25}
                            step={1}
                          />
                        </div>
                        {payinWwPricing.tiers.map((tier, index) => (
                          <div
                            key={`payin-ww-tier-${index}`}
                            className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                          >
                            <p className="text-sm font-bold text-slate-700">Tier {index + 1}</p>
                            <div className="mt-2 grid gap-3 md:grid-cols-3">
                              <NumberField
                                label="MDR (%)"
                                value={tier.mdrPercent}
                                onChange={value =>
                                  setPayinRegionTierField(
                                    "ww",
                                    index as 0 | 1 | 2,
                                    "mdrPercent",
                                    value
                                  )
                                }
                                min={0}
                                max={10}
                                step={0.05}
                              />
                              <NumberField
                                label="TRX CC (€)"
                                value={tier.trxCc}
                                onChange={value =>
                                  setPayinRegionTierField(
                                    "ww",
                                    index as 0 | 1 | 2,
                                    "trxCc",
                                    value
                                  )
                                }
                                min={0}
                                step={0.01}
                              />
                              <NumberField
                                label="TRX APM (€)"
                                value={tier.trxApm}
                                onChange={value =>
                                  setPayinRegionTierField(
                                    "ww",
                                    index as 0 | 1 | 2,
                                    "trxApm",
                                    value
                                  )
                                }
                                min={0}
                                step={0.01}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {payinWwPreview.warnings.length > 0 ? (
                      <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                        {payinWwPreview.warnings.map(warning => (
                          <p key={warning}>{warning}</p>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <h4 className="text-base font-bold text-slate-800">Formula Breakdown (WW)</h4>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                      <MetricCard name="MDR Revenue" value={formatAmount2(payinWwPreview.mdrRevenue)} />
                      <MetricCard name="TRX Revenue" value={formatAmount2(payinWwPreview.trxRevenue)} />
                      <MetricCard name="Total Revenue" value={formatAmount2(payinWwPreview.totalRevenue)} />
                    </div>
                    {showZone3Formulas ? (
                      <div className="mt-3 space-y-2">
                        {payinWwPricing.rateMode === "single" ? (
                          <>
                            <FormulaLine>
                              Formula: MDR Revenue = WW Volume ({formatAmountInteger(payin.volume.ww)}) ×
                              MDR ({formatInputNumber(payinWwPricing.single.mdrPercent)}%) ={" "}
                              {formatAmount2(
                                payin.volume.ww * (payinWwPricing.single.mdrPercent / 100)
                              )}
                            </FormulaLine>
                            <FormulaLine>
                              Formula: TRX Revenue ={" "}
                              {payinWwPricing.trxFeeEnabled
                                ? `Successful WW CC (${formatCount(
                                    payin.successful.byRegionMethod.wwCc
                                  )}) × TRX CC (${formatAmount2(
                                    payinWwPricing.single.trxCc
                                  )}) + Successful WW APM (${formatCount(
                                    payin.successful.byRegionMethod.wwApm
                                  )}) × TRX APM (${formatAmount2(
                                    payinWwPricing.single.trxApm
                                  )})`
                                : "TRX disabled"}
                              {" = "}
                              {formatAmount2(payinWwPreview.trxRevenue)}
                            </FormulaLine>
                          </>
                        ) : (
                          <>
                            {payinWwPreview.tierRows.map(row => (
                              <FormulaLine key={`payin-ww-breakdown-${row.label}`}>
                                {row.label}: Volume {formatAmountInteger(row.volume)} × MDR{" "}
                                {formatInputNumber(row.mdrPercent)}% = {formatAmount2(row.mdrRevenue)};
                                TRX = ({formatInputNumber(row.ccTransactions)} CC trx ×{" "}
                                {formatAmount2(row.trxCc)}) + ({formatInputNumber(row.apmTransactions)}{" "}
                                APM trx × {formatAmount2(row.trxApm)}) ={" "}
                                {formatAmount2(row.trxRevenue)}
                              </FormulaLine>
                            ))}
                          </>
                        )}
                        <FormulaLine>
                          Formula: Total Revenue = MDR Revenue ({formatAmount2(payinWwPreview.mdrRevenue)}) +
                          TRX Revenue ({formatAmount2(payinWwPreview.trxRevenue)}) ={" "}
                          {formatAmount2(payinWwPreview.totalRevenue)}
                        </FormulaLine>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            {calculatorType.payout ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h3 className="text-lg font-bold text-slate-800">Payout Pricing</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Input basis: payout volume {formatAmountInteger(payout.normalized.monthlyVolume)},
                  payout transactions {formatCount(payout.normalized.totalTransactions)}.
                </p>
                <div className="mt-4 grid gap-3">
                  <div>
                    <span className="field-label">Rate Type</span>
                    <div className="flex flex-wrap gap-2">
                      <MiniToggle
                        label="Single Rate"
                        selected={payoutPricing.rateMode === "single"}
                        onSelect={() => setPayoutRateMode("single")}
                        ariaLabel="Payout single rate"
                      />
                      <MiniToggle
                        label="Tiered Rates"
                        selected={payoutPricing.rateMode === "tiered"}
                        onSelect={() => setPayoutRateMode("tiered")}
                        ariaLabel="Payout tiered rates"
                      />
                    </div>
                  </div>
                  {payoutPricing.rateMode === "single" ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <NumberField
                        label="MDR (%)"
                        value={payoutPricing.single.mdrPercent}
                        onChange={value => setPayoutSingleField("mdrPercent", value)}
                        min={0}
                        max={5}
                        step={0.05}
                        helper={
                          payoutSingleRateMinimumAdjustment?.mdrMinimumApplied
                            ? `Configured ${formatInputNumber(
                                payoutSingleRateMinimumAdjustment.configuredMdrPercent
                              )}% -> Applied ${formatInputNumber(
                                payoutSingleRateMinimumAdjustment.appliedMdrPercent
                              )}% (minimum floor).`
                            : undefined
                        }
                        helperTone="warning"
                      />
                      <NumberField
                        label="TRX Fee (€)"
                        value={payoutPricing.single.trxFee}
                        onChange={value => setPayoutSingleField("trxFee", value)}
                        min={0}
                        step={0.01}
                        helper={
                          payoutSingleRateMinimumAdjustment?.trxMinimumApplied
                            ? `Configured ${formatAmount2(
                                payoutSingleRateMinimumAdjustment.configuredTrxFee
                              )} -> Applied ${formatAmount2(
                                payoutSingleRateMinimumAdjustment.appliedTrxFee
                              )} (minimum floor).`
                            : undefined
                        }
                        helperTone="warning"
                      />
                    </div>
                  ) : (
                    <div className="grid gap-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <NumberField
                          label="Tier 1 Up To (M)"
                          value={payoutPricing.tier1UpToMillion}
                          onChange={value => setPayoutTierBoundary("tier1UpToMillion", value)}
                          min={0}
                          max={25}
                          step={1}
                        />
                        <NumberField
                          label="Tier 2 Up To (M)"
                          value={payoutPricing.tier2UpToMillion}
                          onChange={value => setPayoutTierBoundary("tier2UpToMillion", value)}
                          min={payoutPricing.tier1UpToMillion}
                          max={25}
                          step={1}
                        />
                      </div>
                      {payoutPricing.tiers.map((tier, index) => (
                        <div
                          key={`payout-tier-${index}`}
                          className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                        >
                          <p className="text-sm font-bold text-slate-700">Tier {index + 1}</p>
                          <div className="mt-2 grid gap-3 md:grid-cols-2">
                            <NumberField
                              label="MDR (%)"
                              value={tier.mdrPercent}
                              onChange={value =>
                                setPayoutTierField(index as 0 | 1 | 2, "mdrPercent", value)
                              }
                              min={0}
                              max={5}
                              step={0.05}
                              helper={
                                payoutPreview.minimumAdjustments[index]?.mdrMinimumApplied
                                  ? `Configured ${formatInputNumber(
                                      payoutPreview.minimumAdjustments[index].configuredMdrPercent
                                    )}% -> Applied ${formatInputNumber(
                                      payoutPreview.minimumAdjustments[index].appliedMdrPercent
                                    )}% (minimum floor).`
                                  : undefined
                              }
                              helperTone="warning"
                            />
                            <NumberField
                              label="TRX Fee (€)"
                              value={tier.trxFee}
                              onChange={value =>
                                setPayoutTierField(index as 0 | 1 | 2, "trxFee", value)
                              }
                              min={0}
                              step={0.01}
                              helper={
                                payoutPreview.minimumAdjustments[index]?.trxMinimumApplied
                                  ? `Configured ${formatAmount2(
                                      payoutPreview.minimumAdjustments[index].configuredTrxFee
                                    )} -> Applied ${formatAmount2(
                                      payoutPreview.minimumAdjustments[index].appliedTrxFee
                                    )} (minimum floor).`
                                  : undefined
                              }
                              helperTone="warning"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {payoutPreview.warnings.length > 0 ? (
                    <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                      {payoutPreview.warnings.map(warning => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  ) : null}
                  {payoutRateMinimumAdjustments.length > 0 ? (
                    <div className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                      <p className="font-bold">Minimum floors applied in payout calculations:</p>
                      {payoutRateMinimumAdjustments.map(adjustment => (
                        <p key={`payout-floor-${adjustment.scopeLabel}`}>
                          {adjustment.scopeLabel}:{" "}
                          {adjustment.mdrMinimumApplied
                            ? `MDR ${formatInputNumber(
                                adjustment.configuredMdrPercent
                              )}% -> ${formatInputNumber(adjustment.appliedMdrPercent)}%`
                            : `MDR ${formatInputNumber(adjustment.appliedMdrPercent)}%`}{" "}
                          |{" "}
                          {adjustment.trxMinimumApplied
                            ? `TRX ${formatAmount2(
                                adjustment.configuredTrxFee
                              )} -> ${formatAmount2(adjustment.appliedTrxFee)}`
                            : `TRX ${formatAmount2(adjustment.appliedTrxFee)}`}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <h4 className="text-base font-bold text-slate-800">Formula Breakdown (Payout)</h4>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <MetricCard name="MDR Revenue" value={formatAmount2(payoutPreview.mdrRevenue)} />
                    <MetricCard name="TRX Revenue" value={formatAmount2(payoutPreview.trxRevenue)} />
                    <MetricCard name="Total Revenue" value={formatAmount2(payoutPreview.totalRevenue)} />
                  </div>
                  {showZone3Formulas ? (
                    <div className="mt-3 space-y-2">
                      {payoutPricing.rateMode === "single" ? (
                        <>
                          <FormulaLine>
                            Formula: MDR Revenue = Monthly Payout Volume (
                            {formatAmountInteger(payout.normalized.monthlyVolume)}) × MDR (
                            {formatInputNumber(
                              payoutSingleRateMinimumAdjustment?.appliedMdrPercent ??
                                payoutPricing.single.mdrPercent
                            )}
                            %) ={" "}
                            {formatAmount2(
                              payout.normalized.monthlyVolume *
                                ((payoutSingleRateMinimumAdjustment?.appliedMdrPercent ??
                                  payoutPricing.single.mdrPercent) /
                                  100)
                            )}
                          </FormulaLine>
                          {payoutSingleRateMinimumAdjustment?.mdrMinimumApplied ? (
                            <FormulaLine className="border-amber-300 bg-amber-50 text-amber-900">
                              Minimum MDR floor applied: configured{" "}
                              {formatInputNumber(payoutSingleRateMinimumAdjustment.configuredMdrPercent)}%{" "}
                              {"->"} used in calculation{" "}
                              {formatInputNumber(payoutSingleRateMinimumAdjustment.appliedMdrPercent)}% (
                              min {formatInputNumber(PAYOUT_MDR_MIN_PERCENT)}%).
                            </FormulaLine>
                          ) : null}
                          <FormulaLine>
                            Formula: TRX Revenue = Payout Transactions (
                            {formatCount(payout.normalized.totalTransactions)}) × TRX Fee (
                            {formatAmount2(
                              payoutSingleRateMinimumAdjustment?.appliedTrxFee ??
                                payoutPricing.single.trxFee
                            )}
                            ) ={" "}
                            {formatAmount2(payoutPreview.trxRevenue)}
                          </FormulaLine>
                          {payoutSingleRateMinimumAdjustment?.trxMinimumApplied ? (
                            <FormulaLine className="border-amber-300 bg-amber-50 text-amber-900">
                              Minimum TRX floor applied: configured{" "}
                              {formatAmount2(payoutSingleRateMinimumAdjustment.configuredTrxFee)} {"->"}{" "}
                              used in calculation{" "}
                              {formatAmount2(payoutSingleRateMinimumAdjustment.appliedTrxFee)} (min{" "}
                              {formatAmount2(PAYOUT_TRX_MIN_FEE)}).
                            </FormulaLine>
                          ) : null}
                        </>
                      ) : (
                        <>
                          {payoutPreview.tierRows.map(row => (
                            <FormulaLine key={`payout-breakdown-${row.label}`}>
                              {row.label}: Volume {formatAmountInteger(row.volume)} × MDR{" "}
                              {formatInputNumber(row.appliedMdrPercent)}%
                              {row.mdrMinimumApplied
                                ? ` (configured ${formatInputNumber(
                                    row.configuredMdrPercent
                                  )}% -> minimum ${formatInputNumber(row.appliedMdrPercent)}%)`
                                : ""}{" "}
                              = {formatAmount2(row.mdrRevenue)}; TRX = {formatInputNumber(
                                row.transactions
                              )} trx × {formatAmount2(row.appliedTrxFee)}
                              {row.trxMinimumApplied
                                ? ` (configured ${formatAmount2(
                                    row.configuredTrxFee
                                  )} -> minimum ${formatAmount2(row.appliedTrxFee)})`
                                : ""}{" "}
                              ={" "}
                              {formatAmount2(row.trxRevenue)}
                            </FormulaLine>
                          ))}
                        </>
                      )}
                      <FormulaLine>
                        Formula: Total Revenue = MDR Revenue ({formatAmount2(payoutPreview.mdrRevenue)}) +
                        TRX Revenue ({formatAmount2(payoutPreview.trxRevenue)}) ={" "}
                        {formatAmount2(payoutPreview.totalRevenue)}
                      </FormulaLine>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </ZoneSection>

        <ZoneSection
          id="zone4"
          title="Zone 4: Other Fees & Limits"
          subtitle="Configure additional revenue-affecting fees and contract summary settings."
          expanded={zoneExpanded.zone4}
          onToggle={() => toggleZone("zone4")}
          navigation={getZoneNavigation("zone4")}
          headerClassName="border-b border-slate-200 bg-gradient-to-r from-rose-50 to-orange-50 px-5 py-4 md:px-7"
          contentClassName="p-5 md:p-7"
        >
          <div className="grid gap-6">
            <div className="flex justify-end">
              <FormulaVisibilityToggle
                scopeLabel="Zone 4"
                showFormulas={showZone4Formulas}
                onToggle={() => setShowZone4Formulas(current => !current)}
              />
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-lg font-bold text-slate-800">Revenue-Affecting Fees</h3>
              <div className="mt-4 grid gap-5">
                {calculatorType.payout ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                      <input
                        className="h-4 w-4 accent-blue-600"
                        type="checkbox"
                        checked={payoutMinimumFeeEnabled}
                        onChange={event => setPayoutMinimumFeeEnabled(event.target.checked)}
                      />
                      Payout Minimum Fee (Per Transaction)
                    </label>
                    <div className="mt-3">
                      <NumberField
                        label="Minimum Fee per Transaction (€)"
                        value={payoutMinimumFeePerTransaction}
                        onChange={value =>
                          setPayoutMinimumFeePerTransaction(
                            normalizePayoutMinimumFeePerTransaction(value)
                          )
                        }
                        min={0}
                        step={0.1}
                        helper="Rounding rule: always round up to the next €0.10."
                        helperTone="warning"
                      />
                    </div>
                  </div>
                ) : null}

                {calculatorType.payin ? (
                  <div
                    className={[
                      "rounded-xl border bg-slate-50 p-4",
                      hasThreeDsBaseAmbiguity
                        ? "border-rose-300"
                        : "border-slate-200"
                    ].join(" ")}
                  >
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                      <input
                        className="h-4 w-4 accent-blue-600"
                        type="checkbox"
                        checked={threeDsEnabled}
                        onChange={event => setThreeDsEnabled(event.target.checked)}
                      />
                      3D Secure Fee
                    </label>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <NumberField
                        label="3DS Revenue per Successful TRX (€)"
                        value={threeDsRevenuePerSuccessfulTransaction}
                        onChange={value =>
                          setThreeDsRevenuePerSuccessfulTransaction(Math.max(0, value))
                        }
                        min={0}
                        step={0.01}
                      />
                      <NumberField
                        label="Provider 3DS Cost per Attempt (€) - Always"
                        value={DEFAULT_3DS_FEE_CONFIG.providerCostPerAttempt}
                        onChange={() => undefined}
                        readOnly
                      />
                    </div>
                    <div className="mt-3 space-y-2">
                      {hasThreeDsBaseAmbiguity ? (
                        <SpecAmbiguityNotice
                          title="База для Provider 3DS Cost: attempts чи successful?"
                          currentValue={`Provider 3DS Cost = ${formatAmount2(
                            DEFAULT_3DS_FEE_CONFIG.providerCostPerAttempt
                          )} × Total Payin Attempts`}
                          sourceContext="У DOCX є розбіжність: місцями згадується база Total Attempts, але в детальній логіці описано розрахунок від Successful Transactions."
                          usedInFormulas={[
                            "Zone 4: 3DS Cost = Total Payin Attempts × €0.03 (always)",
                            "Zone 5: Other Revenue Net includes 3DS Costs"
                          ]}
                        />
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {!settlementIncluded ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                      <input
                        className="h-4 w-4 accent-blue-600"
                        type="checkbox"
                        checked={settlementFeeEnabled}
                        onChange={event => setSettlementFeeEnabled(event.target.checked)}
                      />
                      Settlement Fee
                    </label>
                    <div className="mt-3">
                      <NumberField
                        label="Settlement Rate (%)"
                        value={settlementFeeRatePercent}
                        onChange={value => setSettlementFeeRatePercent(clampNumber(value, 0, 2))}
                        min={0}
                        max={2}
                        step={0.1}
                        helper="Allowed range: 0.00% to 2.00%."
                        helperTone="warning"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                    Settlement Fee block is hidden because `Settlement Included` is ON in Zone 3.
                  </div>
                )}

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                    <input
                      className="h-4 w-4 accent-blue-600"
                      type="checkbox"
                      checked={monthlyMinimumFeeEnabled}
                      onChange={event => setMonthlyMinimumFeeEnabled(event.target.checked)}
                    />
                    Monthly Minimum Fee
                  </label>
                  <div className="mt-3">
                    <NumberField
                      label="Minimum Monthly Revenue (€)"
                      value={monthlyMinimumFeeAmount}
                      onChange={value => setMonthlyMinimumFeeAmount(Math.max(0, value))}
                      min={0}
                      step={100}
                    />
                  </div>
                </div>

                {calculatorType.payin ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                      <input
                        className="h-4 w-4 accent-blue-600"
                        type="checkbox"
                        checked={failedTrxEnabled}
                        onChange={event => setFailedTrxEnabled(event.target.checked)}
                      />
                      Failed TRX Charging
                    </label>
                    <div className="mt-3 grid gap-3">
                      <NumberField
                        label="Approval Ratio (%) - Auto from Zone 1"
                        value={payin.normalized.approvalRatioPercent}
                        onChange={() => undefined}
                        readOnly
                      />
                      <div>
                        <span className="field-label">Charging Mode</span>
                        <div className="flex flex-wrap gap-2">
                          <MiniToggle
                            label="Over Limit Only"
                            selected={failedTrxMode === "overLimitOnly"}
                            onSelect={() => setFailedTrxMode("overLimitOnly")}
                            ariaLabel="Failed TRX over limit only"
                          />
                          <MiniToggle
                            label="All Failed Volume"
                            selected={failedTrxMode === "allFailedVolume"}
                            onSelect={() => setFailedTrxMode("allFailedVolume")}
                            ariaLabel="Failed TRX all failed volume"
                          />
                        </div>
                      </div>
                      {failedTrxMode === "overLimitOnly" ? (
                        <NumberField
                          label="Over Limit Threshold (%)"
                          value={failedTrxOverLimitThresholdPercent}
                          onChange={value =>
                            setFailedTrxOverLimitThresholdPercent(
                              clampNumber(value, 50, 95)
                            )
                          }
                          min={50}
                          max={95}
                          step={5}
                          helper="Informational mode only. Allowed range: 50% to 95%; lower values reset to 50%."
                          helperTone="warning"
                        />
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <h4 className="text-base font-bold text-slate-800">Formula Breakdown (Zone 4)</h4>
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <MetricCard
                    name="Payout Base Per-TRX Revenue"
                    value={formatAmount2(payoutMinimumFeeImpact.perTransactionRevenue)}
                  />
                  <MetricCard
                    name="Payout Applied Per-TRX Revenue"
                    value={formatAmount2(payoutMinimumFeeImpact.appliedPerTransactionRevenue)}
                  />
                  <MetricCard
                    name="Payout Revenue After Min Fee"
                    value={formatAmount2(payoutMinimumFeeImpact.adjustedRevenue)}
                  />
                  <MetricCard
                    name="Payout Minimum Fee Uplift"
                    value={formatAmount2(payoutMinimumFeeImpact.upliftRevenue)}
                  />
                  <MetricCard name="3DS Revenue" value={formatAmount2(threeDsImpact.revenue)} />
                  <MetricCard name="3DS Cost" value={formatAmount2(threeDsImpact.cost)} />
                  <MetricCard
                    name="Settlement Fee Deduction"
                    value={formatSignedAmount(-settlementFeeImpact.fee)}
                  />
                  <MetricCard
                    name="Monthly Minimum Fee Uplift"
                    value={formatAmount2(monthlyMinimumFeeImpact.upliftRevenue)}
                  />
                  <MetricCard
                    name="Failed TRX Revenue (Effective)"
                    value={formatAmount2(failedTrxImpact.effectiveRevenue)}
                  />
                </div>
                {showZone4Formulas ? (
                  <div className="mt-3 space-y-2">
                    {calculatorType.payout ? (
                      <FormulaLine>
                        Formula: Payout Minimum Per-TRX Revenue = Base Payout Revenue (
                        {formatAmount2(payoutMinimumFeeImpact.baseRevenue)}) / Payout Transactions (
                        {formatCount(payout.normalized.totalTransactions)}) ={" "}
                        {formatAmount2(payoutMinimumFeeImpact.perTransactionRevenue)}
                      </FormulaLine>
                    ) : null}
                    {calculatorType.payout ? (
                      <FormulaLine>
                        Formula: Payout Revenue After Min Fee = max(Base Payout Revenue (
                        {formatAmount2(payoutMinimumFeeImpact.baseRevenue)}), Minimum Fee per TRX (
                        {formatAmount2(payoutMinimumFeePerTransaction)}) × Payout Transactions (
                        {formatCount(payout.normalized.totalTransactions)})) ={" "}
                        {formatAmount2(payoutMinimumFeeImpact.adjustedRevenue)}
                      </FormulaLine>
                    ) : null}
                    {calculatorType.payout ? (
                      <FormulaLine>
                        Formula: Payout Minimum Fee Uplift = max(0, Applied Revenue (
                        {formatAmount2(payoutMinimumFeeImpact.adjustedRevenue)}) - Base Payout Revenue (
                        {formatAmount2(payoutMinimumFeeImpact.baseRevenue)})) ={" "}
                        {formatAmount2(payoutMinimumFeeImpact.upliftRevenue)}
                      </FormulaLine>
                    ) : null}
                    {calculatorType.payin ? (
                      <FormulaLine>
                        Formula: 3DS Revenue = Successful Payin Transactions (
                        {formatCount(threeDsImpact.successfulTransactions)}) × 3DS Revenue per Successful (
                        {formatAmount2(threeDsRevenuePerSuccessfulTransaction)}) (if enabled) ={" "}
                        {formatAmount2(threeDsImpact.revenue)}
                      </FormulaLine>
                    ) : null}
                    {calculatorType.payin ? (
                      <FormulaLine
                        className={
                          hasThreeDsBaseAmbiguity
                            ? "border-rose-300 bg-rose-50 text-rose-900"
                            : ""
                        }
                      >
                        Formula: 3DS Cost = Total Payin Attempts ({formatCount(payin.attempts.total)}) ×
                        Provider 3DS Cost per Attempt ({formatAmount2(
                          DEFAULT_3DS_FEE_CONFIG.providerCostPerAttempt
                        )}) (always) ={" "}
                        {formatAmount2(threeDsImpact.cost)}
                      </FormulaLine>
                    ) : null}
                    {!settlementIncluded ? (
                      <FormulaLine>
                        Formula: Settlement Net = (Payin Volume (
                        {formatAmountInteger(calculatorType.payin ? payin.normalized.monthlyVolume : 0)}
                        ) - Payout Volume (
                        {formatAmountInteger(calculatorType.payout ? payout.normalized.monthlyVolume : 0)}
                        )) - (Payin Fees ALL ({formatAmount2(payinBaseRevenue + threeDsImpact.revenue)})
                        + Payout Fees ALL ({formatAmount2(payoutBaseRevenue)})) ={" "}
                        {formatAmount2(settlementFeeImpact.baseNet)}
                      </FormulaLine>
                    ) : null}
                    {!settlementIncluded ? (
                      <FormulaLine>
                        Formula: Settlement Fee = Chargeable Net (
                        {formatAmount2(settlementFeeImpact.chargeableNet)}) × Rate (
                        {formatInputNumber(settlementFeeRatePercent)}%) ={" "}
                        {formatAmount2(settlementFeeImpact.fee)}
                      </FormulaLine>
                    ) : null}
                    <FormulaLine>
                      Formula: Monthly Minimum Uplift = max(0, Minimum Monthly Revenue (
                      {formatAmount2(monthlyMinimumFeeAmount)}) - Actual Revenue (
                      {formatAmount2(monthlyMinimumFeeImpact.baseRevenue)})) ={" "}
                      {formatAmount2(monthlyMinimumFeeImpact.upliftRevenue)}
                    </FormulaLine>
                    {calculatorType.payin ? (
                      <FormulaLine>
                        Formula: Failed TRX All-Failed Revenue = Failed CC (
                        {formatCount(failedTrxImpact.failedCcTransactions)}) × CC TRX fee (
                        {formatAmount2(effectiveFailedTrxFees.ccFee)}) + Failed APM (
                        {formatCount(failedTrxImpact.failedApmTransactions)}) × APM TRX fee (
                        {formatAmount2(effectiveFailedTrxFees.apmFee)}) ={" "}
                        {formatAmount2(failedTrxImpact.allFailedRevenue)}
                      </FormulaLine>
                    ) : null}
                    {calculatorType.payin && failedTrxMode === "overLimitOnly" ? (
                      <FormulaLine>
                        Formula: Over-Limit Attempts = max(0, Successful (
                        {formatCount(payin.successful.total)}) / Threshold (
                        {formatInputNumber(failedTrxOverLimitThresholdPercent)}%) - Actual Attempts (
                        {formatCount(payin.attempts.total)})) ={" "}
                        {formatCount(failedTrxImpact.overLimitAttempts)}
                      </FormulaLine>
                    ) : null}
                  </div>
                ) : null}
                {payoutMinimumFeeImpact.warning ? (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {payoutMinimumFeeImpact.warning}
                  </p>
                ) : null}
                {monthlyMinimumFeeImpact.warning ? (
                  <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    {monthlyMinimumFeeImpact.warning}
                  </p>
                ) : null}
                {calculatorType.payin && failedTrxMode === "overLimitOnly" && failedTrxEnabled ? (
                  <p className="mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                    Over Limit Only is informational and does not affect profitability totals.
                  </p>
                ) : null}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-lg font-bold text-slate-800">Contract Summary Only</h3>
              <p className="mt-1 text-xs text-slate-500">
                These parameters are shown in offer summary and do not affect Zone 5 profitability.
              </p>
              {calculatorType.payin ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h4 className="text-base font-bold text-slate-800">
                        Payin Minimum Fee
                      </h4>
                      <p className="mt-1 text-xs text-slate-500">
                        Contract summary only. Does not affect Zone 5 profitability.
                      </p>
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                      <input
                        className="h-4 w-4 accent-blue-600"
                        type="checkbox"
                        checked={contractSummarySettings.payoutMinimumFeeMode === "byRegion"}
                        onChange={event =>
                          setContractSummaryField(
                            "payoutMinimumFeeMode",
                            (event.target.checked ? "byRegion" : "overall") as PayoutMinimumFeeMode
                          )
                        }
                      />
                      By region (EU / WW)
                    </label>
                  </div>

                  {contractSummarySettings.payoutMinimumFeeMode === "overall" ? (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <NumberField
                        label="Volume Threshold (M)"
                        value={contractSummarySettings.payoutMinimumFeeThresholdMillion}
                        onChange={value =>
                          setContractSummaryField(
                            "payoutMinimumFeeThresholdMillion",
                            Math.max(0, value)
                          )
                        }
                        min={0}
                        step={0.5}
                        helper="Contract wording: minimum fee applies up to this payin volume tier."
                      />
                      <NumberField
                        label="Minimum Transaction Fee (€)"
                        value={contractSummarySettings.payoutMinimumFeePerTransaction}
                        onChange={value =>
                          setContractSummaryField(
                            "payoutMinimumFeePerTransaction",
                            Math.max(0, value)
                          )
                        }
                        min={0}
                        step={0.01}
                        helper="Default from contract table: €1.00; above threshold is N/A."
                      />
                      <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600 md:col-span-2">
                        Contract preview: ≤€
                        {formatInputNumber(
                          contractSummarySettings.payoutMinimumFeeThresholdMillion
                        )}
                        M: {formatAmount2(contractSummarySettings.payoutMinimumFeePerTransaction)} /
                        &gt;€
                        {formatInputNumber(
                          contractSummarySettings.payoutMinimumFeeThresholdMillion
                        )}
                        M: N/A
                      </p>
                    </div>
                  ) : (
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-sm font-bold text-slate-800">EU</p>
                        <div className="mt-2 grid gap-3 md:grid-cols-2">
                          <NumberField
                            label="EU Volume Threshold (M)"
                            value={contractSummarySettings.payoutMinimumFeeEuThresholdMillion}
                            onChange={value =>
                              setContractSummaryField(
                                "payoutMinimumFeeEuThresholdMillion",
                                Math.max(0, value)
                              )
                            }
                            min={0}
                            step={0.5}
                          />
                          <NumberField
                            label="EU Minimum Transaction Fee (€)"
                            value={contractSummarySettings.payoutMinimumFeeEuPerTransaction}
                            onChange={value =>
                              setContractSummaryField(
                                "payoutMinimumFeeEuPerTransaction",
                                Math.max(0, value)
                              )
                            }
                            min={0}
                            step={0.01}
                          />
                        </div>
                        <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          EU preview: ≤€
                          {formatInputNumber(
                            contractSummarySettings.payoutMinimumFeeEuThresholdMillion
                          )}
                          M: {formatAmount2(contractSummarySettings.payoutMinimumFeeEuPerTransaction)} /
                          &gt;€
                          {formatInputNumber(
                            contractSummarySettings.payoutMinimumFeeEuThresholdMillion
                          )}
                          M: N/A
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-sm font-bold text-slate-800">WW</p>
                        <div className="mt-2 grid gap-3 md:grid-cols-2">
                          <NumberField
                            label="WW Volume Threshold (M)"
                            value={contractSummarySettings.payoutMinimumFeeWwThresholdMillion}
                            onChange={value =>
                              setContractSummaryField(
                                "payoutMinimumFeeWwThresholdMillion",
                                Math.max(0, value)
                              )
                            }
                            min={0}
                            step={0.5}
                          />
                          <NumberField
                            label="WW Minimum Transaction Fee (€)"
                            value={contractSummarySettings.payoutMinimumFeeWwPerTransaction}
                            onChange={value =>
                              setContractSummaryField(
                                "payoutMinimumFeeWwPerTransaction",
                                Math.max(0, value)
                              )
                            }
                            min={0}
                            step={0.01}
                          />
                        </div>
                        <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          WW preview: ≤€
                          {formatInputNumber(
                            contractSummarySettings.payoutMinimumFeeWwThresholdMillion
                          )}
                          M: {formatAmount2(contractSummarySettings.payoutMinimumFeeWwPerTransaction)} /
                          &gt;€
                          {formatInputNumber(
                            contractSummarySettings.payoutMinimumFeeWwThresholdMillion
                          )}
                          M: N/A
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <NumberField
                  label="Account Setup Fee (€, one-time)"
                  value={contractSummarySettings.accountSetupFee}
                  onChange={value => setContractSummaryField("accountSetupFee", Math.max(0, value))}
                  min={0}
                  step={100}
                />
                <NumberField
                  label="Refund Cost (€)"
                  value={contractSummarySettings.refundCost}
                  onChange={value => setContractSummaryField("refundCost", Math.max(10, value))}
                  min={10}
                  step={5}
                  helper="Minimum provider cost is €10. Do not set below €10."
                  helperTone="warning"
                />
                <NumberField
                  label="Dispute/Chargeback Cost (€)"
                  value={contractSummarySettings.disputeCost}
                  onChange={value => setContractSummaryField("disputeCost", Math.max(50, value))}
                  min={50}
                  step={5}
                  helper="Minimum provider cost is €50. Do not set below €50."
                  helperTone="warning"
                />
                <div>
                  <span className="field-label">Settlement Period</span>
                  <div className="flex flex-wrap gap-2">
                    {(["T+1", "T+2", "T+3", "T+4", "T+5"] as SettlementPeriod[]).map(period => (
                      <MiniToggle
                        key={`settlement-period-${period}`}
                        label={period}
                        selected={contractSummarySettings.settlementPeriod === period}
                        onSelect={() => setContractSummaryField("settlementPeriod", period)}
                        ariaLabel={`Settlement period ${period}`}
                      />
                    ))}
                  </div>
                </div>
                <NumberField
                  label="Min Collection Size (€)"
                  value={contractSummarySettings.collectionLimitMin}
                  onChange={value =>
                    setContractSummaryField("collectionLimitMin", Math.max(1, value))
                  }
                  min={1}
                  step={1}
                />
                <NumberField
                  label="Max Collection Size (€)"
                  value={contractSummarySettings.collectionLimitMax}
                  onChange={value =>
                    setContractSummaryField(
                      "collectionLimitMax",
                      Math.max(contractSummarySettings.collectionLimitMin, value)
                    )
                  }
                  min={contractSummarySettings.collectionLimitMin}
                  step={100}
                />
                <NumberField
                  label="Min Payout Size (€)"
                  value={contractSummarySettings.payoutLimitMin}
                  onChange={value => setContractSummaryField("payoutLimitMin", Math.max(0, value))}
                  min={0}
                  step={10}
                />
                <div className="space-y-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                    <input
                      className="h-4 w-4 accent-blue-600"
                      type="checkbox"
                      checked={contractSummarySettings.payoutLimitMax === null}
                      onChange={event =>
                        setContractSummaryField(
                          "payoutLimitMax",
                          event.target.checked
                            ? null
                            : (contractSummarySettings.payoutLimitMax ?? 1_000)
                        )
                      }
                    />
                    Max Payout Size N/A (Unlimited)
                  </label>
                  {contractSummarySettings.payoutLimitMax !== null ? (
                    <NumberField
                      label="Max Payout Size (€)"
                      value={contractSummarySettings.payoutLimitMax}
                      onChange={value =>
                        setContractSummaryField(
                          "payoutLimitMax",
                          Math.max(contractSummarySettings.payoutLimitMin, value)
                        )
                      }
                      min={contractSummarySettings.payoutLimitMin}
                      step={100}
                    />
                  ) : null}
                </div>
                <NumberField
                  label="Rolling Reserve (%)"
                  value={contractSummarySettings.rollingReservePercent}
                  onChange={value =>
                    setContractSummaryField("rollingReservePercent", clampNumber(value, 0, 25))
                  }
                  min={0}
                  max={25}
                  step={1}
                />
                <NumberField
                  label="Rolling Reserve Hold (days)"
                  value={contractSummarySettings.rollingReserveHoldDays}
                  onChange={value =>
                    setContractSummaryField("rollingReserveHoldDays", clampNumber(value, 30, 360))
                  }
                  min={30}
                  max={360}
                  step={30}
                />
                <div className="space-y-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                    <input
                      className="h-4 w-4 accent-blue-600"
                      type="checkbox"
                      checked={contractSummarySettings.rollingReserveCap === null}
                      onChange={event =>
                        setContractSummaryField(
                          "rollingReserveCap",
                          event.target.checked
                            ? null
                            : (contractSummarySettings.rollingReserveCap ?? 50_000)
                        )
                      }
                    />
                    Rolling Reserve Cap N/A
                  </label>
                  {contractSummarySettings.rollingReserveCap !== null ? (
                    <NumberField
                      label="Rolling Reserve Cap (€)"
                      value={contractSummarySettings.rollingReserveCap}
                      onChange={value =>
                        setContractSummaryField("rollingReserveCap", Math.max(0, value))
                      }
                      min={0}
                      step={1000}
                    />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </ZoneSection>

        <ZoneSection
          id="zone5"
          title="Zone 5: Profitability Calculations"
          subtitle="Full profitability model with Payin/Payout/Other categories and total margin."
          expanded={zoneExpanded.zone5}
          onToggle={() => toggleZone("zone5")}
          navigation={getZoneNavigation("zone5")}
          headerClassName="border-b border-slate-200 bg-gradient-to-r from-cyan-50 to-blue-50 px-5 py-4 md:px-7"
          contentClassName="p-5 md:p-7"
        >
          <div className="grid gap-6">
            <div className="rounded-xl border border-blue-200 bg-white p-4">
              <h3 className="text-lg font-bold text-blue-700">Profitability Calculations</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={expandAllUnifiedRows}
                    className="rounded-lg border border-blue-500 bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                    aria-label="Expand all unified profitability rows"
                  >
                    Expand All
                  </button>
                  <button
                    type="button"
                    onClick={collapseAllUnifiedRows}
                    className="rounded-lg border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
                    aria-label="Collapse all unified profitability rows"
                  >
                    Collapse All
                  </button>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-semibold text-slate-800 md:justify-self-end">
                  <input
                    className="h-4 w-4 accent-blue-600"
                    type="checkbox"
                    aria-label="Show Formulas"
                    checked={showUnifiedFormulas}
                    onChange={event => setShowUnifiedFormulas(event.target.checked)}
                  />
                  Show Formulas
                </label>
              </div>
              {hasCommissionBaseAmbiguity ||
              hasSchemeFeesIcPlusAmbiguityEu ||
              hasSchemeFeesIcPlusAmbiguityWw ||
              hasThreeDsBaseAmbiguity ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-rose-700">
                    Відкриті питання, що впливають на фінальний результат
                  </p>
                  {hasCommissionBaseAmbiguity ? (
                    <SpecAmbiguityNotice
                      title="Фінальний блок: база обсягу для Introducer Commission (Standard/Custom)"
                      currentValue={`Commission Base Volume = ${formatAmountInteger(introducerBaseVolume)}`}
                      sourceContext="У DOCX не зафіксовано однозначно, що брати за базу: тільки Payin, тільки Payout чи суму Payin + Payout."
                      usedInFormulas={[
                        "Unified: Introducer Commission (Zone 2 sourced)",
                        "Unified: TOTAL PROFITABILITY -> Our Margin"
                      ]}
                    />
                  ) : null}
                  {hasSchemeFeesIcPlusAmbiguityEu ? (
                    <SpecAmbiguityNotice
                      title="Фінальний блок: Scheme Fees в IC++ (EU) — pass-through чи наші витрати?"
                      currentValue={`EU pricing model = ${
                        payinEuPricing.model === "icpp" ? "IC++" : "Blended"
                      }`}
                      sourceContext="У DOCX є суперечність: в одних місцях Scheme Fees для IC++ як pass-through, в інших вони входять у витрати."
                      usedInFormulas={[
                        "Unified: Payin Revenue & Costs -> EU/WW regional costs",
                        "Unified: TOTAL PROFITABILITY -> Our Margin"
                      ]}
                    />
                  ) : null}
                  {hasSchemeFeesIcPlusAmbiguityWw ? (
                    <SpecAmbiguityNotice
                      title="Фінальний блок: Scheme Fees в IC++ (WW) — pass-through чи наші витрати?"
                      currentValue={`WW pricing model = ${
                        payinWwPricing.model === "icpp" ? "IC++" : "Blended"
                      }`}
                      sourceContext="У DOCX є суперечність: в одних місцях Scheme Fees для IC++ як pass-through, в інших вони входять у витрати."
                      usedInFormulas={[
                        "Unified: Payin Revenue & Costs -> EU/WW regional costs",
                        "Unified: TOTAL PROFITABILITY -> Our Margin"
                      ]}
                    />
                  ) : null}
                  {hasThreeDsBaseAmbiguity ? (
                    <SpecAmbiguityNotice
                      title="Фінальний блок: база для Provider 3DS Cost — attempts чи successful?"
                      currentValue={`Provider 3DS cost = ${formatAmount2(
                        DEFAULT_3DS_FEE_CONFIG.providerCostPerAttempt
                      )} × Total Payin Attempts`}
                      sourceContext="У DOCX є розбіжність щодо бази для 3DS cost: Total Attempts або Successful Transactions."
                      usedInFormulas={[
                        "Unified: Payin Revenue & Costs -> Payin 3DS Costs",
                        "Unified: TOTAL PROFITABILITY -> Our Margin"
                      ]}
                    />
                  ) : null}
                </div>
              ) : null}
              {payoutMinimumFeeImpact.warning || monthlyMinimumFeeImpact.warning ? (
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {payoutMinimumFeeImpact.warning ? (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                      <p className="text-sm font-extrabold">Minimum Fee Applied: Payout</p>
                      <p className="mt-1">
                        Base per-TRX fee from pricing:{" "}
                        <strong>{formatAmount2(payoutMinimumFeeImpact.perTransactionRevenue)}</strong>
                      </p>
                      <p>
                        Configured minimum per-TRX fee:{" "}
                        <strong>{formatAmount2(payoutMinimumFeePerTransaction)}</strong>
                      </p>
                      <p>
                        Used in totals (per-TRX):{" "}
                        <strong>{formatAmount2(payoutMinimumFeeImpact.appliedPerTransactionRevenue)}</strong>
                      </p>
                      <p className="mt-1">
                        Base payout revenue: <strong>{formatAmount2(payoutMinimumFeeImpact.baseRevenue)}</strong>
                      </p>
                      <p>
                        Used in totals (payout revenue):{" "}
                        <strong>{formatAmount2(payoutMinimumFeeImpact.adjustedRevenue)}</strong>
                      </p>
                      <p>
                        Difference from minimum rule:{" "}
                        <strong>+{formatAmount2(payoutMinimumFeeImpact.upliftRevenue)}</strong>
                      </p>
                    </div>
                  ) : null}
                  {monthlyMinimumFeeImpact.warning ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                    <p className="text-sm font-extrabold">Minimum Fee Applied: Monthly</p>
                    <p className="mt-1">
                      Base actual revenue:{" "}
                      <strong>{formatAmount2(monthlyMinimumFeeImpact.baseRevenue)}</strong>
                    </p>
                    <p>
                      Configured monthly minimum:{" "}
                      <strong>{formatAmount2(monthlyMinimumFeeAmount)}</strong>
                    </p>
                    <p>
                      Used in totals (applied monthly revenue):{" "}
                      <strong>{formatAmount2(monthlyMinimumFeeImpact.appliedRevenue)}</strong>
                    </p>
                    <p>
                      Difference from minimum rule:{" "}
                      <strong>+{formatAmount2(monthlyMinimumFeeImpact.upliftRevenue)}</strong>
                    </p>
                  </div>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                {unifiedProfitabilityTree.map(node => (
                  <UnifiedProfitabilityRow
                    key={node.id}
                    node={node}
                    level={0}
                    expandedById={unifiedExpandedById}
                    onToggle={toggleUnifiedRow}
                    showFormulas={showUnifiedFormulas}
                  />
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-4">
              <h3 className="text-lg font-bold text-slate-900">TOTAL PROFITABILITY</h3>
              {introducerEnabled && introducerCommissionType === "revShare" ? (
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <MetricCard name="Total Revenue" value={formatAmount2(totalProfitability.totalRevenue)} />
                  <MetricCard
                    name="Total Costs"
                    value={formatSignedAmount(-totalProfitability.totalCosts)}
                  />
                  <MetricCard
                    name="Margin Before Split"
                    value={formatAmount2(totalProfitability.marginBeforeIntroducer)}
                  />
                  <MetricCard
                    name={`Introducer Commission (${formatInputNumber(
                      totalProfitability.revSharePercentApplied
                    )}%)`}
                    value={formatSignedAmount(-totalProfitability.introducerCommission)}
                  />
                  <MetricCard name="Our Margin" value={formatAmount2(totalProfitability.ourMargin)} />
                </div>
              ) : (
                <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <MetricCard
                    name="Payin Net Margin"
                    value={formatAmount2(totalProfitability.payinNetMargin)}
                  />
                  <MetricCard
                    name="Payout Net Margin"
                    value={formatAmount2(totalProfitability.payoutNetMargin)}
                  />
                  <MetricCard
                    name="Other Revenue"
                    value={formatAmount2(totalProfitability.otherNetMargin)}
                  />
                  <MetricCard
                    name="Total Margin"
                    value={formatAmount2(totalProfitability.marginBeforeIntroducer)}
                  />
                  <MetricCard
                    name="Introducer Commission"
                    value={formatSignedAmount(-totalProfitability.introducerCommission)}
                  />
                  <MetricCard name="Our Margin" value={formatAmount2(totalProfitability.ourMargin)} />
                </div>
              )}
              <div className="mt-3 space-y-2">
                {introducerEnabled && introducerCommissionType === "revShare" ? (
                  <>
                    <FormulaLine>
                      Formula: Margin Before Split = Total Revenue ({formatAmount2(
                        totalProfitability.totalRevenue
                      )}) - Total Costs ({formatAmount2(totalProfitability.totalCosts)}) ={" "}
                      {formatAmount2(totalProfitability.marginBeforeIntroducer)}
                    </FormulaLine>
                    <FormulaLine>
                      Formula: Introducer Commission = Payin Net Margin (
                      {formatAmount2(totalProfitability.payinNetMargin)}) × Partner Share (
                      {formatInputNumber(totalProfitability.revSharePercentApplied)}%) ={" "}
                      {formatAmount2(totalProfitability.introducerCommission)}
                    </FormulaLine>
                  </>
                ) : (
                  <>
                    <FormulaLine>
                      Formula: Total Margin = Payin Net Margin (
                      {formatAmount2(totalProfitability.payinNetMargin)}) + Payout Net Margin (
                      {formatAmount2(totalProfitability.payoutNetMargin)}) + Other Revenue (
                      {formatAmount2(totalProfitability.otherNetMargin)}) ={" "}
                      {formatAmount2(totalProfitability.marginBeforeIntroducer)}
                    </FormulaLine>
                    <FormulaLine>
                      {introducerEnabled
                        ? `Formula: Our Margin = Total Margin (${formatAmount2(
                            totalProfitability.marginBeforeIntroducer
                          )}) - Introducer Commission (${formatAmount2(
                            totalProfitability.introducerCommission
                          )}) = ${formatAmount2(totalProfitability.ourMargin)}`
                        : `Formula: Our Margin = Total Margin (${formatAmount2(
                            totalProfitability.marginBeforeIntroducer
                          )}) because Agent / Introducer is not enabled = ${formatAmount2(
                            totalProfitability.ourMargin
                          )}`}
                    </FormulaLine>
                  </>
                )}
              </div>
              {totalProfitability.warning ? (
                <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                  {totalProfitability.warning}
                </p>
              ) : null}
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              {calculatorType.payin ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="text-base font-bold text-slate-800">Payin Revenue & Costs</h4>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <MetricCard
                      name="Total Payin Revenue"
                      value={formatAmount2(payinProfitability.revenue.total)}
                    />
                    <MetricCard
                      name="Total Payin Costs"
                      value={formatSignedAmount(-payinProfitability.costs.total)}
                      className={hasAnySchemeIcPlusAmbiguity ? "border-rose-300 bg-rose-50" : ""}
                    />
                    <MetricCard
                      name="Payin Net Margin"
                      value={formatAmount2(payinProfitability.netMargin)}
                    />
                    <MetricCard
                      name="Failed TRX Revenue"
                      value={formatAmount2(payinProfitability.revenue.failedTrx)}
                    />
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      <p className="font-semibold text-slate-800">EU</p>
                      <p>Revenue: {formatAmount2(payinProfitability.eu.revenue.total)}</p>
                      <p>Costs: {formatSignedAmount(-payinProfitability.eu.costs.total)}</p>
                      <p>Net: {formatAmount2(payinProfitability.eu.netMargin)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      <p className="font-semibold text-slate-800">WW</p>
                      <p>Revenue: {formatAmount2(payinProfitability.ww.revenue.total)}</p>
                      <p>Costs: {formatSignedAmount(-payinProfitability.ww.costs.total)}</p>
                      <p>Net: {formatAmount2(payinProfitability.ww.netMargin)}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      <p className="font-semibold text-slate-800">EU 3DS</p>
                      <p>3DS Revenue: {formatAmount2(threeDsPayinRegionalBreakdown.eu.revenue)}</p>
                      <p>3DS Costs: {formatSignedAmount(-threeDsPayinRegionalBreakdown.eu.cost)}</p>
                      <p>3DS Net: {formatAmount2(threeDsPayinRegionalBreakdown.eu.net)}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                      <p className="font-semibold text-slate-800">WW 3DS</p>
                      <p>3DS Revenue: {formatAmount2(threeDsPayinRegionalBreakdown.ww.revenue)}</p>
                      <p>3DS Costs: {formatSignedAmount(-threeDsPayinRegionalBreakdown.ww.cost)}</p>
                      <p>3DS Net: {formatAmount2(threeDsPayinRegionalBreakdown.ww.net)}</p>
                    </div>
                  </div>
                  {hasAnySchemeIcPlusAmbiguity ? (
                    <div className="mt-3">
                      <SpecAmbiguityNotice
                        title="Scheme Fees в IC++: pass-through чи наші витрати?"
                        currentValue={`EU model: ${
                          payinEuPricing.model === "icpp" ? "IC++" : "Blended"
                        }, WW model: ${payinWwPricing.model === "icpp" ? "IC++" : "Blended"}`}
                        sourceContext="У DOCX є конфлікт: для IC++ Scheme Fees описані і як pass-through, і як складова наших витрат."
                        usedInFormulas={[
                          "Zone 5: EU/WW Costs = Provider MDR + Provider TRX + Scheme + Interchange",
                          "Zone 5: Payin Net Margin = Total Payin Revenue - Total Payin Costs"
                        ]}
                      />
                    </div>
                  ) : null}
                  <div className="mt-3 space-y-2">
                    <FormulaLine>
                      Formula: Total Payin Revenue = MDR ({formatAmount2(
                        payinProfitability.revenue.mdr
                      )}) + TRX ({formatAmount2(payinProfitability.revenue.trx)}) + Failed TRX (
                      {formatAmount2(payinProfitability.revenue.failedTrx)}) ={" "}
                      {formatAmount2(payinProfitability.revenue.total)}
                    </FormulaLine>
                    <FormulaLine>
                      Formula: Payin 3DS Net = EU 3DS Net (
                      {formatAmount2(threeDsPayinRegionalBreakdown.eu.net)}) + WW 3DS Net (
                      {formatAmount2(threeDsPayinRegionalBreakdown.ww.net)}) ={" "}
                      {formatAmount2(threeDsPayinRegionalBreakdown.total.net)}
                    </FormulaLine>
                    <FormulaLine
                      className={
                        hasAnySchemeIcPlusAmbiguity
                          ? "border-rose-300 bg-rose-50 text-rose-900"
                          : ""
                      }
                    >
                      Formula: Total Payin Costs = EU Costs (
                      {formatAmount2(payinProfitability.eu.costs.total)}) + WW Costs (
                      {formatAmount2(payinProfitability.ww.costs.total)}) ={" "}
                      {formatAmount2(payinProfitability.costs.total)}
                    </FormulaLine>
                    <FormulaLine
                      className={
                        hasAnySchemeIcPlusAmbiguity
                          ? "border-rose-300 bg-rose-50 text-rose-900"
                          : ""
                      }
                    >
                      Formula: Payin Net Margin = Total Payin Revenue (
                      {formatAmount2(payinProfitability.revenue.total)}) - Total Payin Costs (
                      {formatAmount2(payinProfitability.costs.total)}) ={" "}
                      {formatAmount2(payinProfitability.netMargin)}
                    </FormulaLine>
                  </div>
                </div>
              ) : null}

              {calculatorType.payout ? (
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <h4 className="text-base font-bold text-slate-800">Payout Revenue & Costs</h4>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <MetricCard
                      name={
                        payoutMinimumFeeImpact.warning
                          ? "Total Payout Revenue (Minimum Applied)"
                          : "Total Payout Revenue"
                      }
                      value={formatAmount2(payoutProfitability.revenue.total)}
                      className={payoutMinimumFeeImpact.warning ? "border-amber-300 bg-amber-50" : ""}
                    />
                    <MetricCard
                      name="Total Payout Costs"
                      value={formatSignedAmount(-payoutProfitability.costs.total)}
                    />
                    <MetricCard
                      name="Payout Net Margin"
                      value={formatAmount2(payoutProfitability.netMargin)}
                    />
                    <MetricCard
                      name="Payout Minimum Uplift"
                      value={formatAmount2(payoutMinimumFeeImpact.upliftRevenue)}
                    />
                  </div>
                  <div className="mt-3 space-y-2">
                    <FormulaLine>
                      Formula: Base Payout Revenue (before Minimum Fee) = MDR ({formatAmount2(
                        payoutPreview.mdrRevenue
                      )}) + TRX ({formatAmount2(payoutPreview.trxRevenue)}) ={" "}
                      {formatAmount2(payoutBaseRevenue)}
                    </FormulaLine>
                    <FormulaLine>
                      Formula: Applied Payout Revenue = max(Base Revenue ({formatAmount2(
                        payoutBaseRevenue
                      )}), Minimum Fee per TRX ({formatAmount2(
                        payoutMinimumFeePerTransaction
                      )}) × Transactions ({formatCount(
                        payout.normalized.totalTransactions
                      )})) = {formatAmount2(payoutRevenueAdjusted)}
                    </FormulaLine>
                    <FormulaLine>
                      Formula: Total Payout Revenue = MDR ({formatAmount2(
                        payoutProfitability.revenue.mdr
                      )}) + TRX ({formatAmount2(payoutProfitability.revenue.trx)}) ={" "}
                      {formatAmount2(payoutProfitability.revenue.total)}
                    </FormulaLine>
                    {payoutRateMinimumAdjustments.length > 0 ? (
                      <FormulaLine className="border-amber-300 bg-amber-50 text-amber-900">
                        Zone 3 minimum pricing floors used in totals:{" "}
                        {payoutRateMinimumAdjustments
                          .map(adjustment => {
                            const mdrPart = adjustment.mdrMinimumApplied
                              ? `MDR ${formatInputNumber(
                                  adjustment.configuredMdrPercent
                                )}% -> ${formatInputNumber(adjustment.appliedMdrPercent)}%`
                              : `MDR ${formatInputNumber(adjustment.appliedMdrPercent)}%`;
                            const trxPart = adjustment.trxMinimumApplied
                              ? `TRX ${formatAmount2(adjustment.configuredTrxFee)} -> ${formatAmount2(
                                  adjustment.appliedTrxFee
                                )}`
                              : `TRX ${formatAmount2(adjustment.appliedTrxFee)}`;
                            return `${adjustment.scopeLabel}: ${mdrPart}, ${trxPart}`;
                          })
                          .join(" | ")}
                        .
                      </FormulaLine>
                    ) : null}
                    {payoutMinimumFeeImpact.warning ? (
                      <FormulaLine className="border-amber-300 bg-amber-50 text-amber-900">
                        Minimum rule used in totals: Base per-TRX fee (
                        {formatAmount2(payoutMinimumFeeImpact.perTransactionRevenue)}) → Applied per-TRX
                        fee ({formatAmount2(payoutMinimumFeeImpact.appliedPerTransactionRevenue)}); Base
                        payout revenue ({formatAmount2(payoutMinimumFeeImpact.baseRevenue)}) → Used in
                        totals ({formatAmount2(payoutMinimumFeeImpact.adjustedRevenue)}).
                      </FormulaLine>
                    ) : null}
                    <FormulaLine>
                      Formula: Total Payout Costs = Provider MDR ({formatAmount2(
                        payoutProfitability.costs.providerMdr
                      )}) + Provider TRX ({formatAmount2(payoutProfitability.costs.providerTrx)}) ={" "}
                      {formatAmount2(payoutProfitability.costs.total)}
                    </FormulaLine>
                    <FormulaLine>
                      Formula: Payout Net Margin = Total Payout Revenue (
                      {formatAmount2(payoutProfitability.revenue.total)}) - Total Payout Costs (
                      {formatAmount2(payoutProfitability.costs.total)}) ={" "}
                      {formatAmount2(payoutProfitability.netMargin)}
                    </FormulaLine>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-base font-bold text-slate-800">Other Revenue</h4>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <MetricCard
                    name="Settlement Fee"
                    value={formatSignedAmount(otherRevenueProfitability.revenue.settlementFee)}
                  />
                  <MetricCard
                    name={
                      monthlyMinimumFeeImpact.warning
                        ? "Monthly Minimum Adj (Minimum Applied)"
                        : "Monthly Minimum Adj"
                    }
                    value={formatAmount2(otherRevenueProfitability.revenue.monthlyMinimumAdjustment)}
                    className={monthlyMinimumFeeImpact.warning ? "border-amber-300 bg-amber-50" : ""}
                  />
                </div>
                <div className="mt-3 space-y-2">
                  {monthlyMinimumFeeImpact.warning ? (
                    <FormulaLine className="border-amber-300 bg-amber-50 text-amber-900">
                      Minimum rule used in totals: Actual revenue (
                      {formatAmount2(monthlyMinimumFeeImpact.baseRevenue)}) → Applied monthly revenue (
                      {formatAmount2(monthlyMinimumFeeImpact.appliedRevenue)}), delta = +
                      {formatAmount2(monthlyMinimumFeeImpact.upliftRevenue)}.
                    </FormulaLine>
                  ) : null}
                  <FormulaLine
                    className={
                      hasThreeDsBaseAmbiguity
                        ? "border-rose-300 bg-rose-50 text-rose-900"
                        : ""
                    }
                  >
                    Formula: Other Revenue Net = Payin 3DS Net (
                    {formatAmount2(threeDsPayinRegionalBreakdown.total.net)}) - Settlement Fee (
                    {formatAmount2(Math.abs(otherRevenueProfitability.revenue.settlementFee))}) + Monthly Minimum Adj (
                    {formatAmount2(otherRevenueProfitability.revenue.monthlyMinimumAdjustment)}) ={" "}
                    {formatAmount2(otherRevenueProfitability.netMargin)}
                  </FormulaLine>
                </div>
                {hasThreeDsBaseAmbiguity ? (
                  <div className="mt-3">
                    <SpecAmbiguityNotice
                      title="База для Provider 3DS Cost у блоці Payin 3DS"
                      currentValue={`3DS Revenue ${formatAmount2(
                        otherRevenueProfitability.revenue.threeDs
                      )}; 3DS Cost ${formatAmount2(otherRevenueProfitability.costs.threeDs)}`}
                      sourceContext="Потрібно зафіксувати єдину базу для 3DS cost (Total Attempts або Successful Transactions), бо це напряму змінює Payin 3DS Net."
                      usedInFormulas={[
                        "Zone 5: Payin 3DS Net = 3DS Revenue - 3DS Costs",
                        "Zone 5: Total Margin includes Other Revenue Net"
                      ]}
                    />
                  </div>
                ) : null}
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-base font-bold text-slate-800">Introducer Commission</h4>
                {!introducerEnabled ? (
                  <div className="mt-3 space-y-2">
                    <MetricCard name="Agent / Introducer" value="Not enabled" />
                    <FormulaLine>
                      Formula: Introducer Commission = 0 because Agent / Introducer is not enabled.
                    </FormulaLine>
                  </div>
                ) : introducerCommissionType === "revShare" ? (
                  <div className="mt-3 space-y-2">
                    <MetricCard
                      name={`Partner Share (${formatInputNumber(revShareIntroducer.sharePercent)}%)`}
                      value={formatSignedAmount(-revShareIntroducer.partnerShare)}
                    />
                    <FormulaLine>
                      Formula: Partner Share (Payin only) = (Payin Revenue ({formatAmount2(
                        revShareIntroducer.totalRevenue
                      )}) - Payin Costs ({formatAmount2(revShareIntroducer.totalCosts)})) ×{" "}
                      {formatInputNumber(revShareIntroducer.sharePercent)}% ={" "}
                      {formatAmount2(revShareIntroducer.partnerShare)}
                    </FormulaLine>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <MetricCard
                      name={`Commission (${introducerCommissionType === "standard" ? "Standard" : "Custom"})`}
                      value={formatSignedAmount(-introducerCommissionAmount)}
                    />
                    <FormulaLine>
                      Formula: Introducer Commission = Zone 2 Total Introducer Commission ={" "}
                      {formatAmount2(introducerCommissionAmount)}
                    </FormulaLine>
                  </div>
                )}
              </div>
            </div>

            {payoutMinimumFeeImpact.warning ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {payoutMinimumFeeImpact.warning} Used in totals: per-TRX fee{" "}
                {formatAmount2(payoutMinimumFeeImpact.perTransactionRevenue)} →{" "}
                {formatAmount2(payoutMinimumFeeImpact.appliedPerTransactionRevenue)}; payout revenue{" "}
                {formatAmount2(payoutMinimumFeeImpact.baseRevenue)} →{" "}
                {formatAmount2(payoutMinimumFeeImpact.adjustedRevenue)}.
              </p>
            ) : null}
            {monthlyMinimumFeeImpact.warning ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                {monthlyMinimumFeeImpact.warning} Used in totals: actual revenue{" "}
                {formatAmount2(monthlyMinimumFeeImpact.baseRevenue)} → applied monthly revenue{" "}
                {formatAmount2(monthlyMinimumFeeImpact.appliedRevenue)} (minimum target{" "}
                {formatAmount2(monthlyMinimumFeeAmount)}).
              </p>
            ) : null}
            {payoutRateMinimumAdjustments.length > 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Zone 3 payout minimum pricing floors used in totals:{" "}
                {payoutRateMinimumAdjustments
                  .map(adjustment => {
                    const mdrPart = adjustment.mdrMinimumApplied
                      ? `MDR ${formatInputNumber(adjustment.configuredMdrPercent)}% → ${formatInputNumber(
                          adjustment.appliedMdrPercent
                        )}%`
                      : `MDR ${formatInputNumber(adjustment.appliedMdrPercent)}%`;
                    const trxPart = adjustment.trxMinimumApplied
                      ? `TRX ${formatAmount2(adjustment.configuredTrxFee)} → ${formatAmount2(
                          adjustment.appliedTrxFee
                        )}`
                      : `TRX ${formatAmount2(adjustment.appliedTrxFee)}`;
                    return `${adjustment.scopeLabel}: ${mdrPart}, ${trxPart}`;
                  })
                  .join(" | ")}
                .
              </p>
            ) : null}
          </div>
        </ZoneSection>

        <ZoneSection
          id="zone6"
          title="Zone 6: Offer Summary"
          subtitle="Auto-generated proposal text based on active sections and enabled options."
          expanded={zoneExpanded.zone6}
          onToggle={() => toggleZone("zone6")}
          navigation={getZoneNavigation("zone6")}
          headerClassName="border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-blue-50 px-5 py-4 md:px-7"
          contentClassName="p-5 md:p-7"
        >
          <div className="grid gap-6">
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-sm text-slate-600">
                Add optional notes that will be included in the generated offer text.
              </p>
              <label className="mt-3 block">
                <span className="field-label">Client Notes</span>
                <textarea
                  aria-label="Client Notes"
                  className="field-input min-h-[96px] resize-y text-sm font-medium leading-6 text-slate-800"
                  value={clientNotes}
                  onChange={event => setClientNotes(event.target.value)}
                  placeholder="Add client-specific notes for the proposal..."
                />
              </label>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-lg font-bold text-slate-900">Export Actions</h3>
              <p className="mt-1 text-sm text-slate-600">
                Copy the summary, open print dialog, or export via "Save as PDF".
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={handleCopyOfferSummary}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Copy to Clipboard
                </button>
                <button
                  type="button"
                  onClick={handleExportOfferSummaryPdf}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Export to PDF
                </button>
                <button
                  type="button"
                  onClick={handlePrintOfferSummary}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
                >
                  Print
                </button>
              </div>
              {offerSummaryActionMessage ? (
                <p className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800">
                  {offerSummaryActionMessage}
                </p>
              ) : null}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="text-lg font-bold text-slate-900">Offer Summary Preview</h3>
              <p className="mt-1 text-sm text-slate-600">
                Regenerates automatically after every input change.
              </p>
              <label className="mt-3 block">
                <span className="field-label">Offer Summary Preview</span>
                <textarea
                  aria-label="Offer Summary Preview"
                  readOnly
                  className="field-input min-h-[560px] resize-y whitespace-pre font-mono text-xs leading-6 text-slate-800"
                  value={offerSummaryText}
                />
              </label>
            </div>
          </div>
        </ZoneSection>

        {calculatorType.payin ? (
          <ZoneSection
            id="derivedPayin"
            title="Derived Metrics: Payin"
            expanded={zoneExpanded.derivedPayin}
            onToggle={() => toggleZone("derivedPayin")}
            contentClassName="px-5 pb-5 md:px-7 md:pb-7"
          >
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <MetricCard
                name="Rounded Monthly Volume"
                value={formatAmountInteger(payin.normalized.monthlyVolume)}
              />
              <MetricCard
                name="Average Transaction"
                value={formatAmount2(payin.averageTransaction)}
              />
              <MetricCard name="Total Attempts" value={formatCount(payin.attempts.total)} />
              <MetricCard
                name="Failed Transactions"
                value={formatCount(payin.failed.total)}
              />
              <MetricCard
                name="Successful CC / APM"
                value={`${formatCount(payin.successful.cc)} / ${formatCount(
                  payin.successful.apm
                )}`}
              />
              <MetricCard
                name="Regional Volume EU / WW"
                value={`${formatAmountInteger(payin.volume.eu)} / ${formatAmountInteger(
                  payin.volume.ww
                )}`}
              />
              <MetricCard
                name="Payment Volume CC / APM"
                value={`${formatAmountInteger(payin.volume.cc)} / ${formatAmountInteger(
                  payin.volume.apm
                )}`}
              />
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-base font-bold text-slate-800">Calculation Details</h3>
              <div className="mt-3 space-y-2">
                <FormulaLine>
                  Formula: Rounded Monthly Volume = roundUpToStep(max(0, Input Monthly Payin
                  Volume ({formatAmountInteger(payinVolume)})), €50,000) ={" "}
                  {formatAmountInteger(payin.normalized.monthlyVolume)}
                </FormulaLine>
                <FormulaLine>
                  Formula: Average Transaction = Rounded Monthly Volume (
                  {formatAmountInteger(payin.normalized.monthlyVolume)}) / Successful Payin
                  Transactions ({formatCount(payin.successful.total)}) ={" "}
                  {formatAmount2(payin.averageTransaction)}
                </FormulaLine>
                <FormulaLine>
                  Formula: Total Attempts = ceil(Successful Payin Transactions (
                  {formatCount(payin.successful.total)}) / Approval Ratio (
                  {formatInputNumber(payin.normalized.approvalRatioPercent)}%)) ={" "}
                  {formatCount(payin.attempts.total)}
                </FormulaLine>
                <FormulaLine>
                  Formula: Failed Transactions = Total Attempts ({formatCount(payin.attempts.total)}
                  ) - Successful Payin Transactions ({formatCount(payin.successful.total)}) ={" "}
                  {formatCount(payin.failed.total)}
                </FormulaLine>
                <FormulaLine>
                  Formula: Successful CC = Successful EU CC (
                  {formatCount(payin.successful.byRegionMethod.euCc)}) + Successful WW CC (
                  {formatCount(payin.successful.byRegionMethod.wwCc)}) ={" "}
                  {formatCount(payin.successful.cc)}; Successful APM = Successful EU APM (
                  {formatCount(payin.successful.byRegionMethod.euApm)}) + Successful WW APM (
                  {formatCount(payin.successful.byRegionMethod.wwApm)}) ={" "}
                  {formatCount(payin.successful.apm)}
                </FormulaLine>
                <FormulaLine>
                  Formula: Regional Volume EU / WW = Rounded Monthly Volume (
                  {formatAmountInteger(payin.volume.total)}) × EU Split (
                  {formatInputNumber(payin.normalized.euPercent)}%) / WW Split (
                  {formatInputNumber(payin.normalized.wwPercent)}%) ={" "}
                  {formatAmountInteger(payin.volume.eu)} / {formatAmountInteger(payin.volume.ww)}
                </FormulaLine>
                <FormulaLine>
                  Formula: Payment Volume CC / APM = Rounded Monthly Volume (
                  {formatAmountInteger(payin.volume.total)}) × CC Split (
                  {formatInputNumber(payin.normalized.ccPercent)}%) / APM Split (
                  {formatInputNumber(payin.normalized.apmPercent)}%) ={" "}
                  {formatAmountInteger(payin.volume.cc)} / {formatAmountInteger(payin.volume.apm)}
                </FormulaLine>
              </div>
            </div>
          </ZoneSection>
        ) : null}

        {calculatorType.payout ? (
          <ZoneSection
            id="derivedPayout"
            title="Derived Metrics: Payout"
            expanded={zoneExpanded.derivedPayout}
            onToggle={() => toggleZone("derivedPayout")}
            panelClassName=""
            contentClassName="px-5 pb-5 md:px-7 md:pb-7"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <MetricCard
                name="Rounded Monthly Volume"
                value={formatAmountInteger(payout.normalized.monthlyVolume)}
              />
              <MetricCard
                name="Average Transaction"
                value={formatAmount2(payout.averageTransaction)}
              />
            </div>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-base font-bold text-slate-800">Calculation Details</h3>
              <div className="mt-3 space-y-2">
                <FormulaLine>
                  Formula: Rounded Monthly Volume = roundUpToStep(max(0, Input Monthly Payout
                  Volume ({formatAmountInteger(payoutVolume)})), €50,000) ={" "}
                  {formatAmountInteger(payout.normalized.monthlyVolume)}
                </FormulaLine>
                <FormulaLine>
                  Formula: Average Transaction = Rounded Monthly Payout Volume (
                  {formatAmountInteger(payout.normalized.monthlyVolume)}) / Total Payout
                  Transactions ({formatCount(payout.normalized.totalTransactions)}) ={" "}
                  {formatAmount2(payout.averageTransaction)}
                </FormulaLine>
              </div>
            </div>
          </ZoneSection>
        ) : null}
      </div>
    </main>
  );
}
