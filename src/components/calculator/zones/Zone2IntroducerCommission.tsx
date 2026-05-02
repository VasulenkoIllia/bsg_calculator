import {
  DEFAULT_STANDARD_TIERS,
  formatAmount2,
  formatAmountInteger,
  type CustomCommissionResult,
  type IntroducerCommissionType,
  type RevShareResult,
  type StandardCommissionResult
} from "../../../domain/calculator/index.js";
import {
  CommissionModeCard,
  MetricCard,
  NumberField,
  ZoneSection,
  formatInputNumber,
  formatMillion
} from "../index.js";
import type { ZoneSectionNavigation } from "../types.js";

export interface Zone2IntroducerCommissionProps {
  expanded: boolean;
  onToggle: () => void;
  navigation?: ZoneSectionNavigation;
  showFormulas: boolean;
  introducerEnabled: boolean;
  onIntroducerEnabledChange: (enabled: boolean) => void;
  introducerCommissionType: IntroducerCommissionType;
  onIntroducerCommissionTypeChange: (type: IntroducerCommissionType) => void;
  hasPayin: boolean;
  payinMonthlyVolume: number;
  introducerBaseVolume: number;
  customTier1UpToMillion: number;
  customTier2UpToMillion: number;
  customTier1RatePerMillion: number;
  customTier2RatePerMillion: number;
  customTier3RatePerMillion: number;
  onCustomTier1UpToChange: (value: number) => void;
  onCustomTier2UpToChange: (value: number) => void;
  onCustomTier1RatePerMillionChange: (value: number) => void;
  onCustomTier2RatePerMillionChange: (value: number) => void;
  onCustomTier3RatePerMillionChange: (value: number) => void;
  revSharePercent: number;
  onRevSharePercentChange: (value: number) => void;
  standardIntroducer: StandardCommissionResult;
  customIntroducer: CustomCommissionResult;
  revShareIntroducer: RevShareResult;
}

export function Zone2IntroducerCommission({
  expanded,
  onToggle,
  navigation,
  showFormulas,
  introducerEnabled,
  onIntroducerEnabledChange,
  introducerCommissionType,
  onIntroducerCommissionTypeChange,
  hasPayin,
  payinMonthlyVolume,
  introducerBaseVolume,
  customTier1UpToMillion,
  customTier2UpToMillion,
  customTier1RatePerMillion,
  customTier2RatePerMillion,
  customTier3RatePerMillion,
  onCustomTier1UpToChange,
  onCustomTier2UpToChange,
  onCustomTier1RatePerMillionChange,
  onCustomTier2RatePerMillionChange,
  onCustomTier3RatePerMillionChange,
  revSharePercent,
  onRevSharePercentChange,
  standardIntroducer,
  customIntroducer,
  revShareIntroducer
}: Zone2IntroducerCommissionProps) {
  return (
    <ZoneSection
      id="zone2"
      title="Zone 2: Introducer Commission"
      subtitle="Configure partner commission model: Standard, Custom, or Rev Share."
      expanded={expanded}
      onToggle={onToggle}
      navigation={navigation}
      headerClassName="border-b border-slate-200 bg-gradient-to-r from-violet-50 to-fuchsia-50 px-5 py-4 md:px-7"
      contentClassName="p-5 md:p-7"
    >
      <div className={`grid gap-6 ${showFormulas ? "lg:grid-cols-2" : ""}`}>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-lg font-bold text-slate-800">Commission Model</h3>
          <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <input
              className="h-4 w-4 accent-blue-600"
              type="checkbox"
              checked={introducerEnabled}
              onChange={event => onIntroducerEnabledChange(event.target.checked)}
            />
            Agent / Introducer
          </label>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <CommissionModeCard
              label="Standard"
              description="Single retrospective tier applied to full volume."
              selected={introducerCommissionType === "standard"}
              onSelect={() => onIntroducerCommissionTypeChange("standard")}
            />
            <CommissionModeCard
              label="Custom"
              description="Progressive tier model with configurable boundaries."
              selected={introducerCommissionType === "custom"}
              onSelect={() => onIntroducerCommissionTypeChange("custom")}
            />
            <CommissionModeCard
              label="Rev Share"
              description="Partner gets percentage from margin after costs."
              selected={introducerCommissionType === "revShare"}
              onSelect={() => onIntroducerCommissionTypeChange("revShare")}
            />
          </div>

          <div className="mt-4 grid gap-4">
            <div>
              <NumberField
                label="Commission Base Volume (€) - Auto"
                value={introducerBaseVolume}
                onChange={() => undefined}
                readOnly
                helper={`Commission Base Volume = Payin Volume Only (${formatAmountInteger(
                  hasPayin ? payinMonthlyVolume : 0
                )}) = ${formatAmountInteger(introducerBaseVolume)}`}
              />
            </div>
          </div>

          {introducerCommissionType === "custom" ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h4 className="text-base font-bold text-slate-800">Custom Tier Settings</h4>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <NumberField
                  label="Tier 1 Up To (M)"
                  value={customTier1UpToMillion}
                  onChange={onCustomTier1UpToChange}
                  min={0}
                  step={1}
                />
                <NumberField
                  label="Tier 2 Up To (M)"
                  value={customTier2UpToMillion}
                  onChange={onCustomTier2UpToChange}
                  min={customTier1UpToMillion}
                  step={1}
                />
                <NumberField
                  label="Tier 1 Rate (%)"
                  value={customTier1RatePerMillion / 10_000}
                  onChange={value =>
                    onCustomTier1RatePerMillionChange(Math.max(0, value) * 10_000)
                  }
                  min={0}
                  step={0.01}
                />
                <NumberField
                  label="Tier 2 Rate (%)"
                  value={customTier2RatePerMillion / 10_000}
                  onChange={value =>
                    onCustomTier2RatePerMillionChange(Math.max(0, value) * 10_000)
                  }
                  min={0}
                  step={0.01}
                />
                <NumberField
                  label="Tier 3 Rate (%)"
                  value={customTier3RatePerMillion / 10_000}
                  onChange={value =>
                    onCustomTier3RatePerMillionChange(Math.max(0, value) * 10_000)
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
                  onChange={onRevSharePercentChange}
                  min={0}
                  max={50}
                  step={5}
                />
              </div>
            </div>
          ) : null}
        </div>

        {showFormulas ? (
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
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Formula: Total Introducer Commission = Commission Base Volume (
                  {formatMillion(standardIntroducer.volumeMillion)}) × Applied Tier Rate (
                  {formatAmountInteger(standardIntroducer.appliedTier.ratePerMillion)} per €1M) ={" "}
                  {formatAmount2(standardIntroducer.totalCommission)}
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
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
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
        ) : null}
      </div>
    </ZoneSection>
  );
}
