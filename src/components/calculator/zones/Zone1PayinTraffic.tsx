import {
  formatAmount2,
  formatAmountInteger,
  type PayinTrafficDerived
} from "../../../domain/calculator/index.js";
import { NumberField, ZoneSection, formatCount, formatInputNumber } from "../index.js";
import type { ZoneSectionNavigation } from "../types.js";

export interface Zone1PayinTrafficProps {
  expanded: boolean;
  onToggle: () => void;
  navigation?: ZoneSectionNavigation;
  payinVolume: number;
  payinTransactions: number;
  approvalRatioPercent: number;
  euPercent: number;
  wwPercent: number;
  ccPercent: number;
  apmPercent: number;
  payin: PayinTrafficDerived;
  onPayinVolumeChange: (value: number) => void;
  onPayinTransactionsChange: (value: number) => void;
  onApprovalRatioPercentChange: (value: number) => void;
  onEuPercentChange: (value: number) => void;
  onWwPercentChange: (value: number) => void;
  onCcPercentChange: (value: number) => void;
  onApmPercentChange: (value: number) => void;
}

export function Zone1PayinTraffic({
  expanded,
  onToggle,
  navigation,
  payinVolume,
  payinTransactions,
  approvalRatioPercent,
  euPercent,
  wwPercent,
  ccPercent,
  apmPercent,
  payin,
  onPayinVolumeChange,
  onPayinTransactionsChange,
  onApprovalRatioPercentChange,
  onEuPercentChange,
  onWwPercentChange,
  onCcPercentChange,
  onApmPercentChange
}: Zone1PayinTrafficProps) {
  return (
    <ZoneSection
      id="zone1a"
      title="Zone 1A: Payin Traffic Input"
      subtitle="Core traffic data and split configuration for Payin calculations."
      expanded={expanded}
      onToggle={onToggle}
      navigation={navigation}
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
              onChange={onPayinVolumeChange}
              step={50_000}
              helper={`Formatted: ${formatAmountInteger(payinVolume)}`}
            />
            <NumberField
              label="Successful Payin Transactions"
              value={payinTransactions}
              onChange={onPayinTransactionsChange}
              step={100}
              helper={`Count: ${formatCount(payinTransactions)}`}
            />
            <NumberField
              label="Payin Approval Ratio (%)"
              value={approvalRatioPercent}
              onChange={onApprovalRatioPercentChange}
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
              onChange={onEuPercentChange}
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
              onChange={onWwPercentChange}
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
              onChange={onCcPercentChange}
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
              onChange={onApmPercentChange}
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
  );
}
