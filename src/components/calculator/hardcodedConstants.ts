import {
  DEFAULT_3DS_FEE_CONFIG,
  DEFAULT_MONTHLY_MINIMUM_FEE_CONFIG,
  DEFAULT_PAYOUT_MINIMUM_FEE_CONFIG,
  DEFAULT_PROVIDER_PAYIN_MDR_TIERS,
  DEFAULT_PROVIDER_PAYIN_TRX_APM_COST,
  DEFAULT_PROVIDER_PAYIN_TRX_CC_COST,
  DEFAULT_PROVIDER_PAYOUT_MDR_TIERS,
  DEFAULT_PROVIDER_PAYOUT_TRX_TIERS,
  PAYOUT_MDR_MIN_PERCENT,
  PAYOUT_TRX_LOW_WARNING_FEE,
  PAYOUT_TRX_MIN_FEE,
  formatAmountInteger,
  formatVariableAmount
} from "../../domain/calculator/index.js";
import { formatInputNumber } from "./numberUtils.js";
import type { HardcodedConstantGroup } from "./types.js";

export function getHardcodedConstantGroups(): HardcodedConstantGroup[] {
  return [
    {
      title: "Provider Payin Costs (Zone 5)",
      items: [
        {
          label: "Provider MDR tiers",
          value: `0-${formatInputNumber(DEFAULT_PROVIDER_PAYIN_MDR_TIERS.tier1UpToMillion)}M: ${formatInputNumber(
            DEFAULT_PROVIDER_PAYIN_MDR_TIERS.tier1Rate
          )}% | ${formatInputNumber(
            DEFAULT_PROVIDER_PAYIN_MDR_TIERS.tier1UpToMillion
          )}-${formatInputNumber(
            DEFAULT_PROVIDER_PAYIN_MDR_TIERS.tier2UpToMillion
          )}M: ${formatInputNumber(DEFAULT_PROVIDER_PAYIN_MDR_TIERS.tier2Rate)}% | >${formatInputNumber(
            DEFAULT_PROVIDER_PAYIN_MDR_TIERS.tier2UpToMillion
          )}M: ${formatInputNumber(DEFAULT_PROVIDER_PAYIN_MDR_TIERS.tier3Rate)}%`
        },
        {
          label: "Provider TRX CC cost",
          value: formatVariableAmount(DEFAULT_PROVIDER_PAYIN_TRX_CC_COST)
        },
        {
          label: "Provider TRX APM cost",
          value: formatVariableAmount(DEFAULT_PROVIDER_PAYIN_TRX_APM_COST)
        }
      ]
    },
    {
      title: "Provider Payout Costs (Zone 5)",
      items: [
        {
          label: "Provider MDR tiers",
          value: `0-${formatInputNumber(DEFAULT_PROVIDER_PAYOUT_MDR_TIERS.tier1UpToMillion)}M: ${formatInputNumber(
            DEFAULT_PROVIDER_PAYOUT_MDR_TIERS.tier1Rate
          )}% | ${formatInputNumber(
            DEFAULT_PROVIDER_PAYOUT_MDR_TIERS.tier1UpToMillion
          )}-${formatInputNumber(
            DEFAULT_PROVIDER_PAYOUT_MDR_TIERS.tier2UpToMillion
          )}M: ${formatInputNumber(DEFAULT_PROVIDER_PAYOUT_MDR_TIERS.tier2Rate)}% | >${formatInputNumber(
            DEFAULT_PROVIDER_PAYOUT_MDR_TIERS.tier2UpToMillion
          )}M: ${formatInputNumber(DEFAULT_PROVIDER_PAYOUT_MDR_TIERS.tier3Rate)}%`
        },
        {
          label: "Provider TRX tier fees",
          value: `Tier1 ${formatVariableAmount(
            DEFAULT_PROVIDER_PAYOUT_TRX_TIERS.tier1Fee
          )} | Tier2 ${formatVariableAmount(
            DEFAULT_PROVIDER_PAYOUT_TRX_TIERS.tier2Fee
          )} | Tier3 ${formatVariableAmount(DEFAULT_PROVIDER_PAYOUT_TRX_TIERS.tier3Fee)}`
        }
      ]
    },
    {
      title: "Pricing Floors & Guards",
      items: [
        { label: "Payout MDR minimum floor", value: `${formatInputNumber(PAYOUT_MDR_MIN_PERCENT)}%` },
        { label: "Payout TRX minimum floor", value: formatVariableAmount(PAYOUT_TRX_MIN_FEE) },
        { label: "Payout TRX low-fee warning", value: `< ${formatVariableAmount(PAYOUT_TRX_LOW_WARNING_FEE)}` },
        {
          label: "Payout minimum fee default (Zone 4)",
          value: formatVariableAmount(DEFAULT_PAYOUT_MINIMUM_FEE_CONFIG.minimumFeePerTransaction)
        },
        {
          label: "Monthly minimum revenue default (Zone 4)",
          value: formatAmountInteger(DEFAULT_MONTHLY_MINIMUM_FEE_CONFIG.minimumMonthlyRevenue)
        },
        { label: "Payout minimum fee normalization", value: "Always round up to the next €0.10" }
      ]
    },
    {
      title: "Settlement / 3DS / Failed TRX",
      items: [
        { label: "Settlement rate clamp", value: "0% to 2%" },
        { label: "3DS provider cost per attempt", value: formatVariableAmount(DEFAULT_3DS_FEE_CONFIG.providerCostPerAttempt) },
        { label: "3DS revenue per successful (default)", value: formatVariableAmount(DEFAULT_3DS_FEE_CONFIG.revenuePerSuccessfulTransaction) },
        { label: "Failed TRX threshold clamp", value: "50% to 95%" }
      ]
    }
  ];
}
