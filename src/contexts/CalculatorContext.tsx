import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { useCalculatorState } from "../components/calculator/useCalculatorState.js";
import { useCalculatorDerivedData } from "../components/calculator/useCalculatorDerivedData.js";

// Lifted calculator state lives at the App level so multiple pages
// (Calculator and Wizard) share the same source of truth without losing
// data on navigation.

type CalculatorState = ReturnType<typeof useCalculatorState>;
type CalculatorDerived = ReturnType<typeof useCalculatorDerivedData>;

export type CalculatorContextValue = CalculatorState & CalculatorDerived;

const CalculatorContext = createContext<CalculatorContextValue | null>(null);

export function CalculatorProvider({ children }: { children: ReactNode }) {
  const state = useCalculatorState();
  const derived = useCalculatorDerivedData({
    calculatorType: state.calculatorType,
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
    payinEuPricing: state.payinEuPricing,
    payinWwPricing: state.payinWwPricing,
    payoutPricing: state.payoutPricing,
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
    setUnifiedExpandedById: state.setUnifiedExpandedById
  });

  const value = useMemo<CalculatorContextValue>(
    () => ({ ...state, ...derived }),
    [state, derived]
  );

  return <CalculatorContext.Provider value={value}>{children}</CalculatorContext.Provider>;
}

export function useCalculator(): CalculatorContextValue {
  const ctx = useContext(CalculatorContext);
  if (!ctx) {
    throw new Error("useCalculator must be used inside <CalculatorProvider>");
  }
  return ctx;
}
