import {
  type CalculatorTypeSelection,
  type ContractSummarySettings,
  type FailedTrxChargingMode,
  type FailedTrxImpact,
  type MonthlyMinimumFeeImpact,
  type PayoutMinimumFeeImpact,
  type PayinTrafficDerived,
  type PayoutTrafficDerived,
  type SettlementFeeImpact,
  type ThreeDsImpact
} from "../../../domain/calculator/index.js";
import {
  ZoneSection,
} from "../index.js";
import type { ZoneSectionNavigation } from "../types.js";
import { Zone4RevenueAffectingFees } from "./zone4/Zone4RevenueAffectingFees.js";
import { ContractSummarySection } from "./zone4/ContractSummarySection.js";

export interface Zone4OtherFeesAndLimitsProps {
  expanded: boolean;
  onToggle: () => void;
  navigation?: ZoneSectionNavigation;
  calculatorType: CalculatorTypeSelection;
  payin: PayinTrafficDerived;
  payout: PayoutTrafficDerived;
  payoutMinimumFeeEnabled: boolean;
  setPayoutMinimumFeeEnabled: (value: boolean) => void;
  payoutMinimumFeePerTransaction: number;
  setPayoutMinimumFeePerTransaction: (value: number) => void;
  threeDsEnabled: boolean;
  setThreeDsEnabled: (value: boolean) => void;
  threeDsRevenuePerSuccessfulTransaction: number;
  setThreeDsRevenuePerSuccessfulTransaction: (value: number) => void;
  settlementIncluded: boolean;
  settlementFeeEnabled: boolean;
  setSettlementFeeEnabled: (value: boolean) => void;
  settlementFeeRatePercent: number;
  setSettlementFeeRatePercent: (value: number) => void;
  monthlyMinimumFeeEnabled: boolean;
  setMonthlyMinimumFeeEnabled: (value: boolean) => void;
  monthlyMinimumFeeAmount: number;
  setMonthlyMinimumFeeAmount: (value: number) => void;
  failedTrxEnabled: boolean;
  setFailedTrxEnabled: (value: boolean) => void;
  failedTrxMode: FailedTrxChargingMode;
  setFailedTrxMode: (value: FailedTrxChargingMode) => void;
  failedTrxOverLimitThresholdPercent: number;
  setFailedTrxOverLimitThresholdPercent: (value: number) => void;
  showZone4Formulas: boolean;
  payoutMinimumFeeImpact: PayoutMinimumFeeImpact;
  threeDsImpact: ThreeDsImpact;
  settlementFeeImpact: SettlementFeeImpact;
  monthlyMinimumFeeImpact: MonthlyMinimumFeeImpact;
  failedTrxImpact: FailedTrxImpact;
  effectiveFailedTrxFees: {
    ccFee: number;
    apmFee: number;
  };
  payinBaseRevenue: number;
  payoutRevenueAdjusted: number;
  contractSummarySettings: ContractSummarySettings;
  setContractSummaryField: <T extends keyof ContractSummarySettings>(
    field: T,
    value: ContractSummarySettings[T]
  ) => void;
}

export function Zone4OtherFeesAndLimits({
  expanded,
  onToggle,
  navigation,
  calculatorType,
  payin,
  payout,
  payoutMinimumFeeEnabled,
  setPayoutMinimumFeeEnabled,
  payoutMinimumFeePerTransaction,
  setPayoutMinimumFeePerTransaction,
  threeDsEnabled,
  setThreeDsEnabled,
  threeDsRevenuePerSuccessfulTransaction,
  setThreeDsRevenuePerSuccessfulTransaction,
  settlementIncluded,
  settlementFeeEnabled,
  setSettlementFeeEnabled,
  settlementFeeRatePercent,
  setSettlementFeeRatePercent,
  monthlyMinimumFeeEnabled,
  setMonthlyMinimumFeeEnabled,
  monthlyMinimumFeeAmount,
  setMonthlyMinimumFeeAmount,
  failedTrxEnabled,
  setFailedTrxEnabled,
  failedTrxMode,
  setFailedTrxMode,
  failedTrxOverLimitThresholdPercent,
  setFailedTrxOverLimitThresholdPercent,
  showZone4Formulas,
  payoutMinimumFeeImpact,
  threeDsImpact,
  settlementFeeImpact,
  monthlyMinimumFeeImpact,
  failedTrxImpact,
  effectiveFailedTrxFees,
  payinBaseRevenue,
  payoutRevenueAdjusted,
  contractSummarySettings,
  setContractSummaryField
}: Zone4OtherFeesAndLimitsProps) {
  return (
        <ZoneSection
          id="zone4"
          title="Zone 4: Other Fees & Limits"
          subtitle="Configure additional revenue-affecting fees and contract summary settings."
          expanded={expanded}
          onToggle={onToggle}
          navigation={navigation}
          headerClassName="border-b border-slate-200 bg-gradient-to-r from-rose-50 to-orange-50 px-5 py-4 md:px-7"
          contentClassName="p-5 md:p-7"
        >
          <div className="grid gap-6">
            <Zone4RevenueAffectingFees
              calculatorType={calculatorType}
              payin={payin}
              payout={payout}
              payoutMinimumFeeEnabled={payoutMinimumFeeEnabled}
              setPayoutMinimumFeeEnabled={setPayoutMinimumFeeEnabled}
              payoutMinimumFeePerTransaction={payoutMinimumFeePerTransaction}
              setPayoutMinimumFeePerTransaction={setPayoutMinimumFeePerTransaction}
              threeDsEnabled={threeDsEnabled}
              setThreeDsEnabled={setThreeDsEnabled}
              threeDsRevenuePerSuccessfulTransaction={threeDsRevenuePerSuccessfulTransaction}
              setThreeDsRevenuePerSuccessfulTransaction={setThreeDsRevenuePerSuccessfulTransaction}
              settlementIncluded={settlementIncluded}
              settlementFeeEnabled={settlementFeeEnabled}
              setSettlementFeeEnabled={setSettlementFeeEnabled}
              settlementFeeRatePercent={settlementFeeRatePercent}
              setSettlementFeeRatePercent={setSettlementFeeRatePercent}
              monthlyMinimumFeeEnabled={monthlyMinimumFeeEnabled}
              setMonthlyMinimumFeeEnabled={setMonthlyMinimumFeeEnabled}
              monthlyMinimumFeeAmount={monthlyMinimumFeeAmount}
              setMonthlyMinimumFeeAmount={setMonthlyMinimumFeeAmount}
              failedTrxEnabled={failedTrxEnabled}
              setFailedTrxEnabled={setFailedTrxEnabled}
              failedTrxMode={failedTrxMode}
              setFailedTrxMode={setFailedTrxMode}
              failedTrxOverLimitThresholdPercent={failedTrxOverLimitThresholdPercent}
              setFailedTrxOverLimitThresholdPercent={setFailedTrxOverLimitThresholdPercent}
              showZone4Formulas={showZone4Formulas}
              payoutMinimumFeeImpact={payoutMinimumFeeImpact}
              threeDsImpact={threeDsImpact}
              settlementFeeImpact={settlementFeeImpact}
              monthlyMinimumFeeImpact={monthlyMinimumFeeImpact}
              failedTrxImpact={failedTrxImpact}
              effectiveFailedTrxFees={effectiveFailedTrxFees}
              payinBaseRevenue={payinBaseRevenue}
              payoutRevenueAdjusted={payoutRevenueAdjusted}
            />
            <ContractSummarySection
              calculatorType={calculatorType}
              contractSummarySettings={contractSummarySettings}
              setContractSummaryField={setContractSummaryField}
            />
          </div>
        </ZoneSection>

  );
}
