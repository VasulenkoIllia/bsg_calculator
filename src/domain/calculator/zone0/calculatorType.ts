export interface CalculatorTypeSelection {
  payin: boolean;
  payout: boolean;
}

export type CalculatorMode = "payin" | "payout";

export function normalizeCalculatorType(
  selection: Partial<CalculatorTypeSelection>
): CalculatorTypeSelection {
  const payin = Boolean(selection.payin);
  const payout = Boolean(selection.payout);

  if (!payin && !payout) {
    return { payin: true, payout: false };
  }

  return { payin, payout };
}

export function applyCalculatorModeToggle(
  current: CalculatorTypeSelection,
  mode: CalculatorMode,
  checked: boolean
): CalculatorTypeSelection {
  if (mode === "payin") {
    if (!checked && !current.payout) {
      return { payin: false, payout: true };
    }

    return normalizeCalculatorType({
      payin: checked,
      payout: current.payout
    });
  }

  if (!checked && !current.payin) {
    return { payin: true, payout: false };
  }

  return normalizeCalculatorType({
    payin: current.payin,
    payout: checked
  });
}
