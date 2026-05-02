import {
  formatAmount2,
  formatAmountInteger,
  type PayoutTrafficDerived
} from "../../../domain/calculator/index.js";
import { NumberField, ZoneSection, formatCount } from "../index.js";
import type { ZoneSectionNavigation } from "../types.js";

export interface Zone1PayoutTrafficProps {
  expanded: boolean;
  onToggle: () => void;
  navigation?: ZoneSectionNavigation;
  payoutVolume: number;
  payoutTransactions: number;
  payout: PayoutTrafficDerived;
  onPayoutVolumeChange: (value: number) => void;
  onPayoutTransactionsChange: (value: number) => void;
}

export function Zone1PayoutTraffic({
  expanded,
  onToggle,
  navigation,
  payoutVolume,
  payoutTransactions,
  payout,
  onPayoutVolumeChange,
  onPayoutTransactionsChange
}: Zone1PayoutTrafficProps) {
  return (
    <ZoneSection
      id="zone1b"
      title="Zone 1B: Payout Traffic Input"
      subtitle="Dedicated input section for Payout flow data."
      expanded={expanded}
      onToggle={onToggle}
      navigation={navigation}
      headerClassName="border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-sky-50 px-5 py-4 md:px-7"
      contentClassName="p-5 md:p-7"
    >
      <div className="grid gap-4 md:grid-cols-2">
        <NumberField
          label="Monthly Payout Volume (€)"
          value={payoutVolume}
          onChange={onPayoutVolumeChange}
          step={50_000}
          helper={`Formatted: ${formatAmountInteger(payoutVolume)}`}
        />
        <NumberField
          label="Total Payout Transactions"
          value={payoutTransactions}
          onChange={onPayoutTransactionsChange}
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
  );
}
