import type { CalculatorTypeSelection } from "../../../domain/calculator/index.js";
import { ModeToggle, ZoneSection } from "../index.js";
import type { ZoneSectionNavigation } from "../types.js";

export interface Zone0CalculatorTypeProps {
  expanded: boolean;
  onToggle: () => void;
  navigation?: ZoneSectionNavigation;
  calculatorType: CalculatorTypeSelection;
  onPayinEnabledChange: (checked: boolean) => void;
  onPayoutEnabledChange: (checked: boolean) => void;
}

export function Zone0CalculatorType({
  expanded,
  onToggle,
  navigation,
  calculatorType,
  onPayinEnabledChange,
  onPayoutEnabledChange
}: Zone0CalculatorTypeProps) {
  return (
    <ZoneSection
      id="zone0"
      title="Zone 0: Calculator Type"
      subtitle="At least one mode is always enabled. You can run Payin and Payout together."
      expanded={expanded}
      onToggle={onToggle}
      navigation={navigation}
      contentClassName="px-5 pb-5 md:px-7 md:pb-7"
    >
      <div className="flex flex-wrap gap-3">
        <ModeToggle
          label="Payin"
          checked={calculatorType.payin}
          onChange={onPayinEnabledChange}
        />
        <ModeToggle
          label="Payout"
          checked={calculatorType.payout}
          onChange={onPayoutEnabledChange}
        />
      </div>
    </ZoneSection>
  );
}
