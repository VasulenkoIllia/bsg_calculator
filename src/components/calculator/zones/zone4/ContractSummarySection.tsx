import {
  formatVariableAmount,
  type CalculatorTypeSelection,
  type ContractSummarySettings,
  type PayoutMinimumFeeMode,
  type SettlementPeriod
} from "../../../../domain/calculator/index.js";
import {
  MiniToggle,
  NumberField,
  clampNumber,
  formatInputNumber
} from "../../index.js";

export interface ContractSummarySectionProps {
  calculatorType: CalculatorTypeSelection;
  contractSummarySettings: ContractSummarySettings;
  setContractSummaryField: <T extends keyof ContractSummarySettings>(field: T, value: ContractSummarySettings[T]) => void;
}

export function ContractSummarySection({
  calculatorType,
  contractSummarySettings,
  setContractSummaryField,
}: ContractSummarySectionProps) {
  return (
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
                M: {formatVariableAmount(contractSummarySettings.payoutMinimumFeePerTransaction)} /
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
                  M: {formatVariableAmount(
                    contractSummarySettings.payoutMinimumFeeEuPerTransaction
                  )} /
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
                  M: {formatVariableAmount(
                    contractSummarySettings.payoutMinimumFeeWwPerTransaction
                  )} /
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
  );
}
