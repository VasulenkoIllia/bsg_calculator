import type {
  DocumentTemplatePayload,
  DocumentWizardLayout,
  PayinTableMode,
  PayoutTableMode
} from "../types.js";

export function resolveLayout(data: DocumentTemplatePayload): DocumentWizardLayout {
  if (data.layout) {
    return data.layout;
  }

  const euEnabled = data.calculatorType.payin && data.payin.euPercent > 0;
  const wwEnabled = data.calculatorType.payin && data.payin.wwPercent > 0;
  const payinRegionMode = euEnabled && wwEnabled ? "both" : euEnabled ? "euOnly" : wwEnabled ? "wwOnly" : "none";
  const payinTableMode: PayinTableMode =
    payinRegionMode === "none"
      ? data.payinPricing.eu.rateMode === "tiered" || data.payinPricing.ww.rateMode === "tiered"
        ? "flatTiered"
        : "flatSingle"
      : data.payinPricing.eu.rateMode === "tiered" || data.payinPricing.ww.rateMode === "tiered"
        ? "byRegionTiered"
        : "byRegionFlat";
  const payoutTableMode: PayoutTableMode = data.payoutPricing.rateMode === "tiered" ? "globalTiered" : "globalFlat";

  return {
    source: "calculator",
    payin: {
      regionMode: payinRegionMode,
      tableMode: payinTableMode
    },
    payout: {
      regionMode: data.calculatorType.payout ? "global" : "none",
      tableMode: payoutTableMode
    }
  };
}
