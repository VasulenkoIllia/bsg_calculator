import { describe, expect, it } from "vitest";
import { buildOfferPdfHtml } from "./buildOfferPdfHtml.js";
import {
  buildDocumentHeaderMetaFromCalculator,
  buildDocumentTemplatePayloadManualBlank,
  buildDocumentTemplatePayloadManualDefaults,
  buildDocumentTemplatePayloadManual,
  resolveCollectionModelDisplay
} from "./fromCalculator.js";
import type { DocumentTemplatePayload } from "./types.js";

describe("resolveCollectionModelDisplay", () => {
  it("returns single model label when both regions match", () => {
    expect(resolveCollectionModelDisplay("icpp", "icpp")).toBe("IC++");
    expect(resolveCollectionModelDisplay("blended", "blended")).toBe("Blended");
  });

  it("returns mixed model label when regions differ", () => {
    expect(resolveCollectionModelDisplay("icpp", "blended")).toBe("IC++ / Blended");
  });
});

describe("buildDocumentHeaderMetaFromCalculator", () => {
  it("builds default header metadata from calculator models", () => {
    const header = buildDocumentHeaderMetaFromCalculator("blended", "icpp");
    expect(header.documentType).toBe("Commercial Pricing Schedule");
    expect(header.collectionModel).toBe("IC++ / Blended");
    expect(header.collectionFrequency).toBe("Daily (unless agreed otherwise)");
    expect(header.documentNumber.startsWith("BSG-DRAFT-")).toBe(true);
    expect(header.documentDateIso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("manual wizard builders", () => {
  it("creates manual blank draft", () => {
    const draft = buildDocumentTemplatePayloadManualBlank();

    expect(draft.layout.source).toBe("manual");
    expect(draft.layout.payin.regionMode).toBe("both");
    expect(draft.layout.payin.tableMode).toBe("byRegionFlat");
    expect(draft.layout.payout.regionMode).toBe("global");
    expect(draft.layout.payout.tableMode).toBe("globalFlat");
    expect(draft.calculatorType.payin).toBe(true);
    expect(draft.calculatorType.payout).toBe(true);
    expect(draft.contractSummary.refundCost).toBe(0);
    expect(draft.payinPricing.eu.single.mdrPercent).toBe(0);
    expect(draft.payoutPricing.single.trxFee).toBe(0);
    expect(draft.payinPricing.eu.model).toBe("blended");
    expect(draft.payinPricing.ww.model).toBe("icpp");
  });

  it("creates manual default-values draft", () => {
    const draft = buildDocumentTemplatePayloadManualDefaults();

    expect(draft.layout.source).toBe("manual");
    expect(draft.payin.euPercent).toBe(80);
    expect(draft.payin.wwPercent).toBe(20);
    expect(draft.payinPricing.eu.single.mdrPercent).toBe(4.5);
    expect(draft.payinPricing.ww.single.mdrPercent).toBe(5);
    expect(draft.payoutPricing.single.trxFee).toBe(0.5);
    expect(draft.contractSummary.refundCost).toBe(15);
    expect(draft.toggles.failedTrxOverLimitThresholdPercent).toBe(70);
  });

  it("keeps manual alias mapped to blank builder", () => {
    const draft = buildDocumentTemplatePayloadManual();
    expect(draft.contractSummary.refundCost).toBe(0);
    expect(draft.payinPricing.eu.single.mdrPercent).toBe(0);
  });

  it("returns independent nested objects on each call for blank builder", () => {
    const first = buildDocumentTemplatePayloadManualBlank();
    first.payinPricing.eu.tiers[0].mdrPercent = 9.99;
    first.payoutPricing.tiers[0].trxFee = 0.99;

    const second = buildDocumentTemplatePayloadManualBlank();
    expect(second.payinPricing.eu.tiers[0].mdrPercent).toBe(0);
    expect(second.payoutPricing.tiers[0].trxFee).toBe(0);
  });

  it("returns independent nested objects on each call for defaults builder", () => {
    const first = buildDocumentTemplatePayloadManualDefaults();
    first.payinPricing.eu.tiers[0].mdrPercent = 9.99;
    first.payoutPricing.tiers[0].trxFee = 0.99;

    const second = buildDocumentTemplatePayloadManualDefaults();
    expect(second.payinPricing.eu.tiers[0].mdrPercent).toBe(4.5);
    expect(second.payoutPricing.tiers[0].trxFee).toBe(0.5);
  });
});

describe("buildOfferPdfHtml", () => {
  function buildBaseTemplateData(): DocumentTemplatePayload {
    return {
      header: {
        documentType: "Commercial Pricing Schedule",
        documentNumber: "BSG-DRAFT-10001",
        documentDateIso: "2026-05-02",
        collectionModel: "IC++",
        collectionFrequency: "Daily (unless agreed otherwise)"
      },
      documentScope: "offer",
      agreementParties: {
        merchantLegalName: "",
        merchantJurisdiction: "",
        merchantRegisteredAddress: "",
        serviceProviderCoEntityName: "KASEF PAY INC",
        serviceProviderCoEntityJurisdiction: "British Columbia, Canada",
        serviceProviderCoEntityAddress:
          "3200 - 650 West Georgia Street, Vancouver BC V6B 4P7, Canada",
        serviceProviderCoEntityShortLabel: "KASEF PAY"
      },
      layout: {
        source: "calculator",
        payin: {
          regionMode: "none",
          tableMode: "flatSingle"
        },
        payout: {
          regionMode: "global",
          tableMode: "globalFlat"
        }
      },
      calculatorType: {
        payin: true,
        payout: true
      },
      payin: {
        euPercent: 80,
        wwPercent: 20,
        ccPercent: 90,
        apmPercent: 10
      },
      contractSummary: {
        settlementPeriod: "T+2",
        collectionLimitMin: 1,
        collectionLimitMax: 2500,
        payoutLimitMin: 60,
        payoutLimitMax: null,
        rollingReservePercent: 10,
        rollingReserveHoldDays: 90,
        rollingReserveCap: null,
        payoutMinimumFeeMode: "overall",
        payoutMinimumFeeThresholdMillion: 2.5,
        payoutMinimumFeePerTransaction: 1,
        payoutMinimumFeeEuThresholdMillion: 2.5,
        payoutMinimumFeeEuPerTransaction: 1,
        payoutMinimumFeeWwThresholdMillion: 2.5,
        payoutMinimumFeeWwPerTransaction: 1,
        accountSetupFee: 0,
        refundCost: 0,
        disputeCost: 0,
        settlementNote: "Does not apply on weekends and bank holidays",
        clientType: "STD",
        restrictedJurisdictions: "OFAC, US"
      },
      payinPricing: {
        eu: {
          model: "blended",
          rateMode: "single",
          trxFeeEnabled: true,
          tier1UpToMillion: 10,
          tier2UpToMillion: 25,
          single: { mdrPercent: 4.5, trxCc: 0.3, trxApm: 0.35 },
          tiers: [
            { mdrPercent: 4.5, trxCc: 0.3, trxApm: 0.35 },
            { mdrPercent: 4.3, trxCc: 0.3, trxApm: 0.35 },
            { mdrPercent: 4.1, trxCc: 0.3, trxApm: 0.35 }
          ]
        },
        ww: {
          model: "icpp",
          rateMode: "single",
          trxFeeEnabled: true,
          tier1UpToMillion: 10,
          tier2UpToMillion: 25,
          single: { mdrPercent: 4.5, trxCc: 0.3, trxApm: 0.35 },
          tiers: [
            { mdrPercent: 4.5, trxCc: 0.3, trxApm: 0.35 },
            { mdrPercent: 4.3, trxCc: 0.3, trxApm: 0.35 },
            { mdrPercent: 4.1, trxCc: 0.3, trxApm: 0.35 }
          ]
        }
      },
      payoutPricing: {
        rateMode: "single",
        tier1UpToMillion: 1,
        tier2UpToMillion: 5,
        single: { mdrPercent: 2, trxFee: 0.5 },
        tiers: [
          { mdrPercent: 2, trxFee: 0.5 },
          { mdrPercent: 1.8, trxFee: 0.45 },
          { mdrPercent: 1.5, trxFee: 0.4 }
        ]
      },
      toggles: {
        settlementIncluded: false,
        payoutMinimumFeeEnabled: false,
        payoutMinimumFeePerTransaction: 0,
        threeDsEnabled: false,
        threeDsRevenuePerSuccessfulTransaction: 0,
        settlementFeeEnabled: false,
        settlementFeeRatePercent: 0,
        monthlyMinimumFeeEnabled: false,
        monthlyMinimumFeeAmount: 0,
        failedTrxEnabled: false,
        failedTrxMode: "overLimitOnly",
        failedTrxOverLimitThresholdPercent: 70
      }
    };
  }

  it("omits unavailable calculator blocks in preview html", () => {
    const data = buildBaseTemplateData();
    data.calculatorType.payin = false;
    data.layout.payin.regionMode = "none";
    data.layout.payin.tableMode = "flatSingle";

    const html = buildOfferPdfHtml(data);
    expect(html).not.toContain("Card Acquiring — Credit / Debit Cards, APM & E-wallet");
    expect(html).toContain("Card Acquiring — Pay Out / Push to Card");
    expect(html).not.toContain("Other Services & Fees");
    expect(html).toContain("Terms &amp; Limitations");
  });

  it("switches payin table to no-region flat mode when configured", () => {
    const data = buildBaseTemplateData();
    data.layout.payin.regionMode = "none";
    data.layout.payin.tableMode = "flatSingle";
    data.payinPricing.eu.rateMode = "single";
    data.payinPricing.ww.rateMode = "single";

    const html = buildOfferPdfHtml(data);
    expect(html).toContain("Card Acquiring — Credit / Debit Cards, APM &amp; E-wallet");
    expect(html).not.toContain("● EU");
    expect(html).not.toContain("● Global");
    expect(html).toContain("FIXED RATE");
  });

  it("keeps tiered region layout and hides missing placeholder rows for calculator mode", () => {
    const data = buildBaseTemplateData();
    data.layout.payin.regionMode = "both";
    data.layout.payin.tableMode = "byRegionTiered";
    data.payinPricing.eu.rateMode = "tiered";
    data.payinPricing.ww.rateMode = "tiered";
    data.contractSummary.payoutLimitMax = null;
    data.contractSummary.rollingReserveCap = null;

    const html = buildOfferPdfHtml(data);
    expect(html).toContain("VOLUME TIERED");
    expect(html).toContain("MONTHLY VOLUME TIER");
    expect(html).toContain("● EU");
    expect(html).toContain("● Global");
    expect(html).not.toContain("Rolling Reserve Cap");
    expect(html).not.toContain("Max. Payout Transaction Size");
  });

  it("renders failed trx charging card when enabled", () => {
    const data = buildBaseTemplateData();
    data.toggles.failedTrxEnabled = true;
    data.toggles.failedTrxMode = "overLimitOnly";
    data.toggles.failedTrxOverLimitThresholdPercent = 70;

    const html = buildOfferPdfHtml(data);
    expect(html).toContain("FAILED TRX CHARGING");
    expect(html).toContain("Over limit only (70%)");
  });

  it("renders payout minimum fee in section 2 when enabled", () => {
    const data = buildBaseTemplateData();
    data.toggles.payoutMinimumFeeEnabled = true;
    data.toggles.payoutMinimumFeePerTransaction = 2.5;

    const html = buildOfferPdfHtml(data);
    expect(html).toContain("MINIMUM FEE");
    expect(html).toContain("€2.50");
  });
});
