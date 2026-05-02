import type {
  CalculatorTypeSelection,
  ContractSummarySettings,
  FailedTrxChargingMode,
  PayinRegionPricingConfig,
  PayinTrafficDerived,
  PayoutPricingConfig,
  PayoutTrafficDerived,
  PricingModelType
} from "../../domain/calculator/index.js";
import type { DocumentHeaderMetaDraft, DocumentWizardTemplateData } from "./types.js";

const DEFAULT_COLLECTION_FREQUENCY = "Daily (unless agreed otherwise)";

function todayIsoDate(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultDraftNumber(): string {
  const suffix = String(Date.now() % 100_000).padStart(5, "0");
  return `BSG-DRAFT-${suffix}`;
}

function toCollectionModelToken(model: PricingModelType): string {
  return model === "icpp" ? "IC++" : "Blended";
}

export function resolveCollectionModelDisplay(
  euModel: PricingModelType,
  wwModel: PricingModelType
): string {
  if (euModel === wwModel) {
    return toCollectionModelToken(euModel);
  }
  return "IC++ / Blended";
}

export function buildDocumentHeaderMetaFromCalculator(
  payinEuModel: PricingModelType,
  payinWwModel: PricingModelType
): DocumentHeaderMetaDraft {
  return {
    documentType: "Commercial Pricing Schedule",
    documentNumber: defaultDraftNumber(),
    documentDateIso: todayIsoDate(),
    collectionModel: resolveCollectionModelDisplay(payinEuModel, payinWwModel),
    collectionFrequency: DEFAULT_COLLECTION_FREQUENCY
  };
}

function resolvePayinRegionMode(
  payinEnabled: boolean,
  euPercent: number,
  wwPercent: number
): "both" | "euOnly" | "wwOnly" | "none" {
  if (!payinEnabled) return "none";
  const euEnabled = euPercent > 0;
  const wwEnabled = wwPercent > 0;
  if (euEnabled && wwEnabled) return "both";
  if (euEnabled) return "euOnly";
  if (wwEnabled) return "wwOnly";
  return "none";
}

export interface BuildDocumentWizardTemplateInput {
  header: DocumentHeaderMetaDraft;
  calculatorType: CalculatorTypeSelection;
  payin: PayinTrafficDerived;
  payout: PayoutTrafficDerived;
  payinEuPricing: PayinRegionPricingConfig;
  payinWwPricing: PayinRegionPricingConfig;
  payoutPricing: PayoutPricingConfig;
  payoutMinimumFeeEnabled: boolean;
  payoutMinimumFeePerTransaction: number;
  threeDsEnabled: boolean;
  threeDsRevenuePerSuccessfulTransaction: number;
  settlementIncluded: boolean;
  settlementFeeEnabled: boolean;
  settlementFeeRatePercent: number;
  monthlyMinimumFeeEnabled: boolean;
  monthlyMinimumFeeAmount: number;
  failedTrxEnabled: boolean;
  failedTrxMode: FailedTrxChargingMode;
  failedTrxOverLimitThresholdPercent: number;
  contractSummarySettings: ContractSummarySettings;
}

export function buildDocumentWizardTemplateDataFromCalculator({
  header,
  calculatorType,
  payin,
  payout,
  payinEuPricing,
  payinWwPricing,
  payoutPricing,
  payoutMinimumFeeEnabled,
  payoutMinimumFeePerTransaction,
  threeDsEnabled,
  threeDsRevenuePerSuccessfulTransaction,
  settlementIncluded,
  settlementFeeEnabled,
  settlementFeeRatePercent,
  monthlyMinimumFeeEnabled,
  monthlyMinimumFeeAmount,
  failedTrxEnabled,
  failedTrxMode,
  failedTrxOverLimitThresholdPercent,
  contractSummarySettings
}: BuildDocumentWizardTemplateInput): DocumentWizardTemplateData {
  const payinRegionMode = resolvePayinRegionMode(
    calculatorType.payin,
    payin.normalized.euPercent,
    payin.normalized.wwPercent
  );
  const payinTableMode = (() => {
    if (payinRegionMode === "none") {
      return payinEuPricing.rateMode === "tiered" || payinWwPricing.rateMode === "tiered"
        ? "flatTiered"
        : "flatSingle";
    }

    if (payinEuPricing.rateMode === "tiered" || payinWwPricing.rateMode === "tiered") {
      return "byRegionTiered";
    }

    return "byRegionFlat";
  })();

  const payoutTableMode = payoutPricing.rateMode === "tiered" ? "globalTiered" : "globalFlat";

  return {
    header: { ...header },
    layout: {
      source: "calculator",
      payin: {
        regionMode: payinRegionMode,
        tableMode: payinTableMode
      },
      payout: {
        regionMode: calculatorType.payout ? "global" : "none",
        tableMode: payoutTableMode
      }
    },
    calculatorType: { ...calculatorType },
    payin: {
      euPercent: payin.normalized.euPercent,
      wwPercent: payin.normalized.wwPercent,
      ccPercent: payin.normalized.ccPercent,
      apmPercent: payin.normalized.apmPercent
    },
    contractSummary: { ...contractSummarySettings },
    payinPricing: {
      eu: {
        model: payinEuPricing.model,
        rateMode: payinEuPricing.rateMode,
        trxFeeEnabled: payinEuPricing.trxFeeEnabled,
        tier1UpToMillion: payinEuPricing.tier1UpToMillion,
        tier2UpToMillion: payinEuPricing.tier2UpToMillion,
        single: { ...payinEuPricing.single },
        tiers: payinEuPricing.tiers.map(tier => ({ ...tier }))
      },
      ww: {
        model: payinWwPricing.model,
        rateMode: payinWwPricing.rateMode,
        trxFeeEnabled: payinWwPricing.trxFeeEnabled,
        tier1UpToMillion: payinWwPricing.tier1UpToMillion,
        tier2UpToMillion: payinWwPricing.tier2UpToMillion,
        single: { ...payinWwPricing.single },
        tiers: payinWwPricing.tiers.map(tier => ({ ...tier }))
      }
    },
    payoutPricing: {
      rateMode: payoutPricing.rateMode,
      tier1UpToMillion: payoutPricing.tier1UpToMillion,
      tier2UpToMillion: payoutPricing.tier2UpToMillion,
      single: { ...payoutPricing.single },
      tiers: payoutPricing.tiers.map(tier => ({ ...tier }))
    },
    toggles: {
      settlementIncluded,
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
      failedTrxOverLimitThresholdPercent
    }
  };
}
