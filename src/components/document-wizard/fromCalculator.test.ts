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
        settlementPeriod: "T+3",
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
        payoutMinimumFeeEuNa: false,
        payoutMinimumFeeWwNa: false,
        accountSetupFee: 0,
        refundCost: 0,
        disputeCost: 0,
        settlementNote: "Does not apply on weekends and bank holidays",
        clientType: "STD",
        restrictedJurisdictions: "OFAC, US",
        customTermsItems: [],
        payinCustomNoteEnabled: false,
        payinCustomNoteText: "",
        payoutCustomNoteEnabled: false,
        payoutCustomNoteText: ""
      },
      payinPricing: {
        eu: {
          model: "blended",
          rateMode: "single",
          trxFeeEnabled: true,
          tier1UpToMillion: 10,
          tier2UpToMillion: 25,
          single: { mdrPercent: 4.5, trxCc: 0.3, trxCcNa: false, trxApm: 0.35, trxApmNa: false },
          tiers: [
            { mdrPercent: 4.5, trxCc: 0.3, trxCcNa: false, trxApm: 0.35, trxApmNa: false },
            { mdrPercent: 4.3, trxCc: 0.3, trxCcNa: false, trxApm: 0.35, trxApmNa: false },
            { mdrPercent: 4.1, trxCc: 0.3, trxCcNa: false, trxApm: 0.35, trxApmNa: false }
          ]
        },
        ww: {
          model: "icpp",
          rateMode: "single",
          trxFeeEnabled: true,
          tier1UpToMillion: 10,
          tier2UpToMillion: 25,
          single: { mdrPercent: 4.5, trxCc: 0.3, trxCcNa: false, trxApm: 0.35, trxApmNa: false },
          tiers: [
            { mdrPercent: 4.5, trxCc: 0.3, trxCcNa: false, trxApm: 0.35, trxApmNa: false },
            { mdrPercent: 4.3, trxCc: 0.3, trxCcNa: false, trxApm: 0.35, trxApmNa: false },
            { mdrPercent: 4.1, trxCc: 0.3, trxCcNa: false, trxApm: 0.35, trxApmNa: false }
          ]
        }
      },
      payoutPricing: {
        rateMode: "single",
        tier1UpToMillion: 1,
        tier2UpToMillion: 5,
        single: { mdrPercent: 2, trxFee: 0.5, trxFeeNa: false },
        tiers: [
          { mdrPercent: 2, trxFee: 0.5, trxFeeNa: false },
          { mdrPercent: 1.8, trxFee: 0.45, trxFeeNa: false },
          { mdrPercent: 1.5, trxFee: 0.4, trxFeeNa: false }
        ]
      },
      toggles: {
        settlementIncluded: false,
        payoutMinimumFeeEnabled: false,
        payoutMinimumFeePerTransaction: 0,
        payoutMinimumFeePerTransactionNa: false,
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
    expect(html).toContain("● EEA + UK");
    expect(html).toContain("● Global");
    // Optional fields with no value and no explicit mode hide the row.
    // Mode = "value" / undefined + empty value → hide. The user picks
    // N/A or TBD explicitly via the wizard if they want a literal label.
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
    expect(html).toContain("Under limit only (70.00%)");
  });

  it("renders payout minimum fee in section 2 when enabled", () => {
    const data = buildBaseTemplateData();
    data.toggles.payoutMinimumFeeEnabled = true;
    data.toggles.payoutMinimumFeePerTransaction = 2.5;

    const html = buildOfferPdfHtml(data);
    expect(html).toContain("MINIMUM FEE");
    expect(html).toContain("€2.50");
  });

  describe("N/A toggles", () => {
    it("payin TRX C/D N/A renders C/D: N/A while APM keeps its value", () => {
      const data = buildBaseTemplateData();
      data.layout.payin.regionMode = "both";
      data.layout.payin.tableMode = "byRegionFlat";
      data.payinPricing.eu.single.trxCcNa = true;

      const html = buildOfferPdfHtml(data);
      expect(html).toContain("C/D: N/A");
      expect(html).toContain("APM: €0.35");
    });

    it("payin TRX APM N/A renders APM: N/A independently of C/D", () => {
      const data = buildBaseTemplateData();
      data.layout.payin.regionMode = "both";
      data.layout.payin.tableMode = "byRegionFlat";
      data.payinPricing.eu.single.trxApmNa = true;

      const html = buildOfferPdfHtml(data);
      expect(html).toContain("C/D: €0.30");
      expect(html).toContain("APM: N/A");
    });

    it("payin tiered TRX N/A toggles only the affected tier", () => {
      const data = buildBaseTemplateData();
      data.layout.payin.regionMode = "both";
      data.layout.payin.tableMode = "byRegionTiered";
      data.payinPricing.eu.rateMode = "tiered";
      data.payinPricing.ww.rateMode = "tiered";
      data.payinPricing.eu.tiers[1].trxCcNa = true;

      const html = buildOfferPdfHtml(data);
      // Tier 0 still shows numeric, tier 1 shows N/A.
      expect(html).toContain("C/D: N/A");
      expect(html).toContain("C/D: €0.30");
    });

    it("payin MIN. TRX FEE N/A renders 'N/A' for the toggled region only", () => {
      const data = buildBaseTemplateData();
      data.layout.payin.regionMode = "both";
      data.layout.payin.tableMode = "byRegionFlat";
      data.contractSummary.payoutMinimumFeeMode = "byRegion";
      data.contractSummary.payoutMinimumFeeEuThresholdMillion = 2.5;
      data.contractSummary.payoutMinimumFeeEuPerTransaction = 1;
      data.contractSummary.payoutMinimumFeeWwThresholdMillion = 2.5;
      data.contractSummary.payoutMinimumFeeWwPerTransaction = 1;
      data.contractSummary.payoutMinimumFeeEuNa = true;

      const html = buildOfferPdfHtml(data);
      expect(html).toContain("MIN. TRANSACTION FEE");
      // EU row shows N/A; WW row keeps the threshold-based value
      // (secondary line uses the escaped &gt; entity).
      expect(html).toContain("&gt;2.5M: N/A");
      expect(html).toContain("≤2.5M: €1.00");
    });

    it("payout TRX Fee N/A renders N/A in the muted gray class", () => {
      const data = buildBaseTemplateData();
      data.payoutPricing.single.trxFeeNa = true;

      const html = buildOfferPdfHtml(data);
      // value-na class wraps the standalone "N/A" so it renders in the
      // muted gray colour instead of the accent (purple) used for €.
      expect(html).toContain("value-na");
      expect(html).toMatch(/value-na[^"]*">N\/A</);
    });

    it("payout MIN. FEE N/A renders 'N/A' in the muted gray class", () => {
      const data = buildBaseTemplateData();
      data.toggles.payoutMinimumFeePerTransactionNa = true;

      const html = buildOfferPdfHtml(data);
      expect(html).toContain("MINIMUM FEE");
      expect(html).toContain('<span class="value-na">N/A</span>');
    });

    it("payin TRX C/D N/A uses the muted gray class instead of the tier blue", () => {
      const data = buildBaseTemplateData();
      data.layout.payin.regionMode = "both";
      data.layout.payin.tableMode = "byRegionFlat";
      data.payinPricing.eu.single.trxCcNa = true;

      const html = buildOfferPdfHtml(data);
      // C/D switches to the muted value-na class; APM keeps the
      // single-mode default tier-color-1 (blue).
      expect(html).toMatch(/value-na[^"]*">C\/D: N\/A</);
      expect(html).toMatch(/tier-color-1[^"]*">APM: €0\.35</);
    });
  });

  describe("tiered visual styling", () => {
    it("payin tiered rows colour each tier with tier-color-1/2/3", () => {
      const data = buildBaseTemplateData();
      data.layout.payin.regionMode = "both";
      data.layout.payin.tableMode = "byRegionTiered";
      data.payinPricing.eu.rateMode = "tiered";
      data.payinPricing.ww.rateMode = "tiered";

      const html = buildOfferPdfHtml(data);
      // Each tier has its own colour class applied to label + fees.
      expect(html).toContain("tier-color-1");
      expect(html).toContain("tier-color-2");
      expect(html).toContain("tier-color-3");
    });

    it("payin tiered rows keep MDR percent in the default body colour", () => {
      const data = buildBaseTemplateData();
      data.layout.payin.regionMode = "both";
      data.layout.payin.tableMode = "byRegionTiered";
      data.payinPricing.eu.rateMode = "tiered";
      data.payinPricing.ww.rateMode = "tiered";

      const html = buildOfferPdfHtml(data);
      // The percent value lives in a plain cell-line span, not coloured.
      expect(html).toMatch(/<span class="cell-line">4\.50%/);
    });

    it("payout tiered rows colour each tier with tier-color-1/2/3", () => {
      const data = buildBaseTemplateData();
      data.layout.payout.regionMode = "global";
      data.layout.payout.tableMode = "globalTiered";
      data.payoutPricing.rateMode = "tiered";

      const html = buildOfferPdfHtml(data);
      expect(html).toContain("tier-color-1");
      expect(html).toContain("tier-color-2");
      expect(html).toContain("tier-color-3");
    });

    it("APM brand list line uses the muted cell-subtitle class", () => {
      const data = buildBaseTemplateData();

      const html = buildOfferPdfHtml(data);
      expect(html).toMatch(
        /<span class="cell-line cell-subtitle">APM - Apple Pay, Google Pay/
      );
    });

    it("MIN. TRANSACTION FEE secondary line is rendered in muted gray", () => {
      const data = buildBaseTemplateData();
      data.layout.payin.regionMode = "both";
      data.layout.payin.tableMode = "byRegionFlat";
      data.contractSummary.payoutMinimumFeeMode = "byRegion";
      data.contractSummary.payoutMinimumFeeEuThresholdMillion = 2.5;
      data.contractSummary.payoutMinimumFeeEuPerTransaction = 1;
      data.contractSummary.payoutMinimumFeeWwThresholdMillion = 2.5;
      data.contractSummary.payoutMinimumFeeWwPerTransaction = 1;

      const html = buildOfferPdfHtml(data);
      // The "≤2.5M: €1.00" primary line stays in default colour;
      // the ">2.5M: N/A" secondary line carries the muted value-na class.
      expect(html).toContain('<span class="cell-line">≤2.5M: €1.00</span>');
      expect(html).toContain('<span class="cell-line value-na">&gt;2.5M: N/A</span>');
    });

    it("FAILED TRX CHARGING card no longer shows the Calculator mode subtitle", () => {
      const data = buildBaseTemplateData();
      data.toggles.failedTrxEnabled = true;
      data.toggles.failedTrxMode = "allFailedVolume";

      const html = buildOfferPdfHtml(data);
      expect(html).toContain("FAILED TRX CHARGING");
      expect(html).toContain("All failed volume");
      // The hint subtitle was removed by request.
      expect(html).not.toContain("Calculator mode");
    });

    it("Rolling Reserve Cap renders N/A when valueModes.rollingReserveCap is 'na'", () => {
      const data = buildBaseTemplateData();
      data.contractSummary.rollingReserveCap = 5000;
      data.valueModes = { ...(data.valueModes ?? {}), rollingReserveCap: "na" };

      const html = buildOfferPdfHtml(data);
      // Mode wins over the numeric value: cell shows "N/A" not "€5,000".
      expect(html).toContain("Rolling Reserve Cap");
      expect(html).toContain("N/A");
      expect(html).not.toContain("€5,000");
    });

    it("Rolling Reserve Cap renders TBD when mode is 'tbd'", () => {
      const data = buildBaseTemplateData();
      data.contractSummary.rollingReserveCap = 5000;
      data.valueModes = { ...(data.valueModes ?? {}), rollingReserveCap: "tbd" };

      const html = buildOfferPdfHtml(data);
      expect(html).toContain("Rolling Reserve Cap");
      expect(html).toContain("TBD");
    });

    it("Rolling Reserve Cap shows the numeric value when mode is 'value' (default)", () => {
      const data = buildBaseTemplateData();
      data.contractSummary.rollingReserveCap = 5000;
      // No valueModes override → defaults to numeric path.

      const html = buildOfferPdfHtml(data);
      expect(html).toContain("Rolling Reserve Cap");
      expect(html).toContain("€5,000");
    });

    it("Max. Payout Transaction Size hides when Max is empty + mode is value/undefined", () => {
      const data = buildBaseTemplateData();
      data.contractSummary.payoutLimitMin = 60;
      data.contractSummary.payoutLimitMax = null;
      // No explicit valueMode → defaults to "value" → empty hides row.

      const html = buildOfferPdfHtml(data);
      expect(html).toContain("Min. Payout Transaction Size");
      expect(html).not.toContain("Max. Payout Transaction Size");
    });

    it("Max. Payout Transaction Size renders 'N/A' when mode is explicitly 'na'", () => {
      const data = buildBaseTemplateData();
      data.contractSummary.payoutLimitMin = 60;
      data.contractSummary.payoutLimitMax = null;
      data.valueModes = { ...(data.valueModes ?? {}), payoutLimitMax: "na" };

      const html = buildOfferPdfHtml(data);
      expect(html).toContain("Max. Payout Transaction Size");
      expect(html).toContain("N/A");
    });

    it("Min. Collection Transaction Size renders 'TBD' when mode is 'tbd'", () => {
      const data = buildBaseTemplateData();
      data.contractSummary.collectionLimitMin = 1;
      data.valueModes = { ...(data.valueModes ?? {}), collectionLimitMin: "tbd" };

      const html = buildOfferPdfHtml(data);
      expect(html).toContain("Min. Collection Transaction Size");
      expect(html).toContain("TBD");
      expect(html).not.toContain("€1 EUR");
    });

    it("Max. Payout Transaction Size renders TBD when valueModes mode is 'tbd'", () => {
      const data = buildBaseTemplateData();
      data.contractSummary.payoutLimitMin = 60;
      data.contractSummary.payoutLimitMax = 5000;
      data.valueModes = { ...(data.valueModes ?? {}), payoutLimitMax: "tbd" };

      const html = buildOfferPdfHtml(data);
      expect(html).toContain("Max. Payout Transaction Size");
      expect(html).toContain("TBD");
      // Numeric value is overridden by mode.
      expect(html).not.toContain("€5,000 EUR");
    });

    it("Max. Payout Transaction Size shows numeric value when set + mode is 'value'", () => {
      const data = buildBaseTemplateData();
      data.contractSummary.payoutLimitMin = 60;
      data.contractSummary.payoutLimitMax = 10000;
      // Default mode = "value" via undefined.

      const html = buildOfferPdfHtml(data);
      expect(html).toContain("Max. Payout Transaction Size");
      expect(html).toContain("€10,000 EUR");
    });

    it("Terms grid 'N/A' value is wrapped in muted .value-na class", () => {
      const data = buildBaseTemplateData();
      data.contractSummary.collectionLimitMax = 0;
      data.valueModes = { ...(data.valueModes ?? {}), collectionLimitMax: "na" };

      const html = buildOfferPdfHtml(data);
      // Same gray rule as the pricing tables — N/A reads in muted gray.
      expect(html).toContain('<span class="value-na">N/A</span>');
    });

    it("Fee card 'N/A' value is wrapped in muted .value-na class", () => {
      const data = buildBaseTemplateData();
      data.contractSummary.refundCost = 0;
      data.valueModes = { ...(data.valueModes ?? {}), refundCost: "na" };

      const html = buildOfferPdfHtml(data);
      // Refund card now shows N/A in muted gray (not bold dark).
      expect(html).toContain("REFUND");
      expect(html).toContain('<span class="value-na">N/A</span>');
    });
  });

  describe("custom Terms & Limitations blocks", () => {
    it("appends a custom block to the terms grid with the chosen colour", () => {
      const data = buildBaseTemplateData();
      data.contractSummary.customTermsItems = [
        {
          id: "x1",
          label: "** Decline fee removal",
          value: "After 2 consecutive months of processing 1M/m",
          color: "orange"
        }
      ];

      const html = buildOfferPdfHtml(data);
      expect(html).toContain("** Decline fee removal");
      expect(html).toContain("After 2 consecutive months of processing 1M/m");
      expect(html).toContain("terms-value-orange");
    });

    it("renders multiple custom blocks each with its own colour class", () => {
      const data = buildBaseTemplateData();
      data.contractSummary.customTermsItems = [
        { id: "a", label: "Block A", value: "Body A", color: "blue" },
        { id: "b", label: "Block B", value: "Body B", color: "black" },
        { id: "c", label: "Block C", value: "Body C", color: "orange" }
      ];

      const html = buildOfferPdfHtml(data);
      expect(html).toContain("Block A");
      expect(html).toContain("Block B");
      expect(html).toContain("Block C");
      expect(html).toContain("terms-value-blue");
      expect(html).toContain("terms-value-black");
      expect(html).toContain("terms-value-orange");
    });

    it("skips fully empty custom blocks (no label and no body)", () => {
      const data = buildBaseTemplateData();
      data.contractSummary.customTermsItems = [
        { id: "empty", label: "", value: "", color: "blue" },
        { id: "real", label: "Heading", value: "Body", color: "blue" }
      ];

      const html = buildOfferPdfHtml(data);
      expect(html).toContain("Heading");
      // Empty block doesn't produce a "Block" label in the rendered grid.
      expect(html.match(/terms-label/g)?.length ?? 0).toBeGreaterThan(0);
    });

    it("default customTermsItems is an empty array — no custom rows in the PDF", () => {
      const data = buildBaseTemplateData();
      // Built fixture already has customTermsItems: [].

      const html = buildOfferPdfHtml(data);
      // The class definitions live in the inlined <style> block — what
      // matters is that no terms-value span actually USES the colour
      // classes in the body.
      expect(html).not.toMatch(/class="[^"]*terms-value-blue[^"]*"/);
      expect(html).not.toMatch(/class="[^"]*terms-value-orange[^"]*"/);
      expect(html).not.toMatch(/class="[^"]*terms-value-black[^"]*"/);
    });

    it("built-in terms rows still render unchanged (no colour override)", () => {
      const data = buildBaseTemplateData();
      data.contractSummary.customTermsItems = [];

      const html = buildOfferPdfHtml(data);
      expect(html).toContain("Settlement");
      expect(html).toContain("Daily, T+3");
      // Built-in row carries plain `terms-value` class only.
      expect(html).toMatch(/<span class="terms-value">Daily, T\+3</);
    });
  });

  describe("section custom notes", () => {
    it("renders payin custom note under the Card Acquiring table when enabled", () => {
      const data = buildBaseTemplateData();
      data.contractSummary.payinCustomNoteEnabled = true;
      data.contractSummary.payinCustomNoteText =
        "*Min. Transaction fee applies to successful transaction fees only.";

      const html = buildOfferPdfHtml(data);
      // Match actual element usage, not the CSS class declaration in <style>.
      expect(html).toMatch(/<p class="section-custom-note">/);
      expect(html).toContain(
        "*Min. Transaction fee applies to successful transaction fees only."
      );
    });

    it("hides payin custom note when toggle is off even if text is set", () => {
      const data = buildBaseTemplateData();
      data.contractSummary.payinCustomNoteEnabled = false;
      data.contractSummary.payinCustomNoteText = "Note that should be hidden";

      const html = buildOfferPdfHtml(data);
      expect(html).not.toMatch(/<p class="section-custom-note">/);
      expect(html).not.toContain("Note that should be hidden");
    });

    it("hides payin custom note when text is empty even if toggle is on", () => {
      const data = buildBaseTemplateData();
      data.contractSummary.payinCustomNoteEnabled = true;
      data.contractSummary.payinCustomNoteText = "   ";

      const html = buildOfferPdfHtml(data);
      expect(html).not.toMatch(/<p class="section-custom-note">/);
    });

    it("renders payout custom note under the Pay Out table when enabled", () => {
      const data = buildBaseTemplateData();
      data.contractSummary.payoutCustomNoteEnabled = true;
      data.contractSummary.payoutCustomNoteText = "Payout-specific note text.";

      const html = buildOfferPdfHtml(data);
      expect(html).toMatch(/<p class="section-custom-note">/);
      expect(html).toContain("Payout-specific note text.");
    });

    it("payin and payout notes render independently with their own text", () => {
      const data = buildBaseTemplateData();
      data.contractSummary.payinCustomNoteEnabled = true;
      data.contractSummary.payinCustomNoteText = "PAYIN-NOTE-XYZ";
      data.contractSummary.payoutCustomNoteEnabled = true;
      data.contractSummary.payoutCustomNoteText = "PAYOUT-NOTE-XYZ";

      const html = buildOfferPdfHtml(data);
      expect(html).toContain("PAYIN-NOTE-XYZ");
      expect(html).toContain("PAYOUT-NOTE-XYZ");
      // Two separate <p class="section-custom-note"> elements (one per section).
      expect((html.match(/<p class="section-custom-note">/g) ?? []).length).toBe(2);
    });
  });

  describe("auto-compact mode", () => {
    it("payin tiered + both regions (6 rows) gets the compact class", () => {
      const data = buildBaseTemplateData();
      data.layout.payin.regionMode = "both";
      data.layout.payin.tableMode = "byRegionTiered";
      data.payinPricing.eu.rateMode = "tiered";
      data.payinPricing.ww.rateMode = "tiered";

      const html = buildOfferPdfHtml(data);
      // Section 1 (Card Acquiring) wraps in offer-section compact
      expect(html).toMatch(/<section class="offer-section compact">[\s\S]*Card Acquiring/);
    });

    it("payin single + one region (1 row) stays in normal mode", () => {
      const data = buildBaseTemplateData();
      data.layout.payin.regionMode = "euOnly";
      data.layout.payin.tableMode = "byRegionFlat";
      data.payinPricing.eu.rateMode = "single";

      const html = buildOfferPdfHtml(data);
      // No compact class on the Card Acquiring section
      expect(html).toMatch(/<section class="offer-section">[\s\S]*Card Acquiring/);
    });

    it("payin tiered + one region + custom note triggers compact", () => {
      const data = buildBaseTemplateData();
      data.layout.payin.regionMode = "euOnly";
      data.layout.payin.tableMode = "byRegionTiered";
      data.payinPricing.eu.rateMode = "tiered";
      data.contractSummary.payinCustomNoteEnabled = true;
      data.contractSummary.payinCustomNoteText = "Note adds vertical weight.";

      const html = buildOfferPdfHtml(data);
      // 3 rows + custom note → compact threshold met
      expect(html).toMatch(/<section class="offer-section compact">[\s\S]*Card Acquiring/);
    });

    it("payout tiered (3 rows) gets the compact class", () => {
      const data = buildBaseTemplateData();
      data.layout.payout.regionMode = "global";
      data.layout.payout.tableMode = "globalTiered";
      data.payoutPricing.rateMode = "tiered";

      const html = buildOfferPdfHtml(data);
      // Section 2 (Pay Out) compact
      expect(html).toMatch(/<section class="offer-section compact">[\s\S]*Pay Out/);
    });

    it("payout single (1 row) stays in normal mode", () => {
      const data = buildBaseTemplateData();
      data.layout.payout.regionMode = "global";
      data.layout.payout.tableMode = "globalFlat";
      data.payoutPricing.rateMode = "single";

      const html = buildOfferPdfHtml(data);
      expect(html).toMatch(/<section class="offer-section">[\s\S]*Pay Out/);
    });

    it("Pay Out row carries force-page-break-before when payin is heavy (tiered + both regions)", () => {
      const data = buildBaseTemplateData();
      data.layout.payin.regionMode = "both";
      data.layout.payin.tableMode = "byRegionTiered";
      data.payinPricing.eu.rateMode = "tiered";
      data.payinPricing.ww.rateMode = "tiered";
      data.layout.payout.regionMode = "global";
      data.layout.payout.tableMode = "globalFlat";

      const html = buildOfferPdfHtml(data);
      // The TR that contains the Pay Out section carries the
      // force-page-break-before class so section 2 starts on page 2.
      expect(html).toMatch(
        /<tr class="force-page-break-before"><td class="page-content-cell">[\s\S]*Pay Out/
      );
      // Other Services & Fees DOES NOT carry the break in heavy mode —
      // it follows section 2 on page 2 naturally.
      expect(html).not.toMatch(
        /<tr class="force-page-break-before"><td class="page-content-cell">[\s\S]*Other Services/
      );
    });

    it("Pay Out row stays in normal flow when payin is light (non-tiered or one region)", () => {
      const data = buildBaseTemplateData();
      data.layout.payin.regionMode = "euOnly";
      data.layout.payin.tableMode = "byRegionFlat";
      data.payinPricing.eu.rateMode = "single";
      data.layout.payout.regionMode = "global";
      data.layout.payout.tableMode = "globalFlat";

      const html = buildOfferPdfHtml(data);
      // No force-page-break class on the Pay Out row when payin is
      // single-region / non-tiered.
      expect(html).not.toMatch(
        /<tr class="force-page-break-before"><td class="page-content-cell">[\s\S]*Pay Out/
      );
    });

    it("Other Services & Fees carries force-page-break-before when payin is light", () => {
      const data = buildBaseTemplateData();
      data.layout.payin.regionMode = "both";
      data.layout.payin.tableMode = "byRegionFlat";
      data.payinPricing.eu.rateMode = "single";
      data.payinPricing.ww.rateMode = "single";
      data.layout.payout.regionMode = "global";
      data.layout.payout.tableMode = "globalFlat";
      data.contractSummary.refundCost = 15;
      data.contractSummary.disputeCost = 75;

      const html = buildOfferPdfHtml(data);
      // Sections 1 + 2 stay on page 1; section 3 (Other Services & Fees)
      // is forced to start on page 2 so sections 3 + 4 share page 2.
      expect(html).toMatch(
        /<tr class="force-page-break-before"><td class="page-content-cell">[\s\S]*Other Services/
      );
    });

    it("Other Services & Fees stays inline when payin section is missing", () => {
      const data = buildBaseTemplateData();
      data.calculatorType.payin = false;
      data.layout.payin.regionMode = "none";
      data.contractSummary.refundCost = 15;
      data.contractSummary.disputeCost = 75;

      const html = buildOfferPdfHtml(data);
      // With no payin section, the page-budget rule does not apply —
      // Other Services & Fees flows naturally.
      expect(html).not.toMatch(
        /<tr class="force-page-break-before"><td class="page-content-cell">[\s\S]*Other Services/
      );
    });

    it("terms section becomes compact when total items >= 8", () => {
      const data = buildBaseTemplateData();
      // Built-in items: settlement, settlementNote, clientType,
      // restrictedJurisdictions, collectionMin, collectionMax,
      // payoutMin, rollingReserve = 8 items already with default data.
      // Add a custom block to push past the threshold.
      data.contractSummary.customTermsItems = [
        { id: "x", label: "Custom 1", value: "Body 1", color: "blue" },
        { id: "y", label: "Custom 2", value: "Body 2", color: "blue" }
      ];

      const html = buildOfferPdfHtml(data);
      expect(html).toMatch(/<section class="offer-section compact">[\s\S]*Terms &amp; Limitations/);
    });
  });

  describe("payin custom rows — section 1.1 Additional Card Acquiring", () => {
    // These tests guard the operator-driven custom-rows feature, which
    // lives in its OWN section 1.1 "Additional Card Acquiring" in the
    // PDF (NOT appended to section 1's table). The split keeps
    // section 1 within its calibrated 6-row worst-case fill and gives
    // the orchestrator a clean force-page-break point for section 1.1
    // on heavy payin.
    //
    // NB: buildBaseTemplateData has `regionMode: "none"` and
    // `tableMode: "flatSingle"` — a "single fallback row" mode where
    // resolvePayinRegionContexts emits one row labeled "Global". We
    // override regionMode / tableMode in tests that need standard
    // EU + WW rows on the table.

    function withBothRegions(data: DocumentTemplatePayload): DocumentTemplatePayload {
      data.layout.payin.regionMode = "both";
      data.layout.payin.tableMode = "byRegionFlat";
      return data;
    }

    it("undefined customRows (back-compat) → no section 1.1 emitted", () => {
      const data = withBothRegions(buildBaseTemplateData());
      expect(data.payinPricing.customRows).toBeUndefined();

      const html = buildOfferPdfHtml(data);

      expect(html).toContain("● EEA + UK");
      expect(html).toContain("● Global");
      // Section 1.1 absent entirely when customRows is undefined.
      // Check the actual rendered <h2>, not bare text (CSS comments
      // mention the string for documentation — they live in <style>).
      expect(html).not.toMatch(/<h2>Additional Card Acquiring/);
    });

    it("single-rate custom row → emits its own section 1.1 with one data row", () => {
      const data = withBothRegions(buildBaseTemplateData());
      data.payinPricing.customRows = [
        {
          id: "row-test-1",
          region: "Russia",
          currency: "USDT",
          model: "blended",
          rateMode: "single",
          trxFeeEnabled: true,
          tier1UpToMillion: 5,
          tier2UpToMillion: 10,
          single: {
            mdrPercent: 6.5,
            trxCc: 0.5,
            trxCcNa: false,
            trxApm: 0.5,
            trxApmNa: false
          },
          tiers: [
            { mdrPercent: 0, trxCc: 0, trxCcNa: false, trxApm: 0, trxApmNa: false },
            { mdrPercent: 0, trxCc: 0, trxCcNa: false, trxApm: 0, trxApmNa: false },
            { mdrPercent: 0, trxCc: 0, trxCcNa: false, trxApm: 0, trxApmNa: false }
          ],
          minTrxFeeThresholdMillion: 2.5,
          minTrxFeePerTransaction: 1.5,
          minTrxFeeRowNa: false
        }
      ];

      const html = buildOfferPdfHtml(data);

      // Section 1.1 has the expected title + "1.1" index badge.
      expect(html).toMatch(/<h2>Additional Card Acquiring/);
      expect(html).toMatch(/<span class="section-index">1\.1<\/span>/);
      // Custom row content rendered inside section 1.1.
      expect(html).toContain("● Russia");
      expect(html).toContain("<td>USDT</td>");
      expect(html).toContain("Blended");
      expect(html).toContain("6.50%");
      expect(html).toContain("C/D: €0.50");
      expect(html).toContain("APM: €0.50");
      // Per-row MIN. TRX FEE rendered inside section 1.1.
      expect(html).toContain("≤2.5M: €1.50");
      expect(html).toContain("&gt;2.5M: N/A");
      // Russia must NOT bleed into section 1 (standard regions).
      const standardSection =
        html.match(/section-index">1<\/span>[\s\S]*?<\/section>/)?.[0] ?? "";
      expect(standardSection).not.toContain("Russia");
    });

    it("tiered custom row → emits section 1.1 with 3 tier rows + tier-color classes", () => {
      const data = withBothRegions(buildBaseTemplateData());
      // Standard rows stay single. Section 1.1 has its OWN tier-column
      // visibility — driven by the tiered custom row regardless of
      // section 1's mode.
      data.payinPricing.customRows = [
        {
          id: "row-test-2",
          region: "LATAM Bundle",
          currency: "USD",
          model: "icpp",
          rateMode: "tiered",
          trxFeeEnabled: true,
          tier1UpToMillion: 3,
          tier2UpToMillion: 7,
          single: { mdrPercent: 0, trxCc: 0, trxCcNa: false, trxApm: 0, trxApmNa: false },
          tiers: [
            { mdrPercent: 5.0, trxCc: 0.4, trxCcNa: false, trxApm: 0.4, trxApmNa: false },
            { mdrPercent: 4.5, trxCc: 0.35, trxCcNa: false, trxApm: 0.35, trxApmNa: false },
            { mdrPercent: 4.0, trxCc: 0.3, trxCcNa: false, trxApm: 0.3, trxApmNa: false }
          ],
          minTrxFeeThresholdMillion: 0,
          minTrxFeePerTransaction: 0,
          minTrxFeeRowNa: true
        }
      ];

      const html = buildOfferPdfHtml(data);

      // Section 1.1 present.
      expect(html).toMatch(/<h2>Additional Card Acquiring/);
      // Three different MDR values from the three tiers — same row.
      expect(html).toContain("5.00%");
      expect(html).toContain("4.50%");
      expect(html).toContain("4.00%");
      // Tier-color classes applied to tier label cells (any of the three).
      expect(html).toMatch(/<td class="tier-color-1">/);
      expect(html).toMatch(/<td class="tier-color-2">/);
      expect(html).toMatch(/<td class="tier-color-3">/);
      // Region repeated 3 times (once per tier row) within section 1.1.
      const regionMatches = html.match(/● LATAM Bundle/g);
      expect(regionMatches?.length).toBe(3);
      // MONTHLY VOLUME TIER column shown inside section 1.1 because
      // at least one custom row is tiered.
      expect(html).toContain("MONTHLY VOLUME TIER");
      // MIN. TRX FEE renders as muted N/A for this row.
      expect(html).toContain('<span class="cell-line value-na">N/A</span>');
    });

    it("section 1.1 gets force-page-break-before on HEAVY payin (push to page 2)", () => {
      const data = withBothRegions(buildBaseTemplateData());
      // Standard rows already single in the fixture; promote layout —
      // wizard would do this automatically via the updated
      // resolvePayinTableMode helper (with customRows arg).
      data.layout.payin.tableMode = "byRegionTiered";
      data.payinPricing.customRows = [
        {
          id: "row-test-heavy",
          region: "Asia Bundle",
          currency: "USD",
          model: "icpp",
          rateMode: "single",
          trxFeeEnabled: true,
          tier1UpToMillion: 5,
          tier2UpToMillion: 10,
          single: { mdrPercent: 5, trxCc: 0.4, trxCcNa: false, trxApm: 0.4, trxApmNa: false },
          tiers: [
            { mdrPercent: 0, trxCc: 0, trxCcNa: false, trxApm: 0, trxApmNa: false },
            { mdrPercent: 0, trxCc: 0, trxCcNa: false, trxApm: 0, trxApmNa: false },
            { mdrPercent: 0, trxCc: 0, trxCcNa: false, trxApm: 0, trxApmNa: false }
          ],
          minTrxFeeThresholdMillion: 0,
          minTrxFeePerTransaction: 0,
          minTrxFeeRowNa: false
        }
      ];
      // Force heavy payin: tiered both regions.
      data.payinPricing.eu.rateMode = "tiered";
      data.payinPricing.ww.rateMode = "tiered";

      const html = buildOfferPdfHtml(data);

      // The Section 1.1 <tr> wrapper carries the force-page-break-before
      // class on heavy payin. Cap the lookahead at 1000 chars so the
      // regex cannot span multiple TRs and accidentally match section 1
      // followed by section 1.1.
      expect(html).toMatch(
        /<tr class="force-page-break-before">[\s\S]{0,1000}?<h2>Additional Card Acquiring/
      );
    });

    it("explicit empty customRows = [] (back-compat) → no section 1.1 emitted", () => {
      // Mirrors the undefined-customRows test but with an explicit
      // empty array. Guards the early-exit guard in
      // buildPayinAdditionalSection against being reordered or moved
      // below the `?? []` coalesce in the future.
      const data = withBothRegions(buildBaseTemplateData());
      data.payinPricing.customRows = [];

      const html = buildOfferPdfHtml(data);

      expect(html).not.toMatch(/<h2>Additional Card Acquiring/);
    });

    it("custom row with zero threshold + zero fee + no N/A → MIN. TRX FEE column hidden", () => {
      const data = withBothRegions(buildBaseTemplateData());
      data.payinPricing.customRows = [
        {
          id: "row-test-zero-fee",
          region: "ZeroFeeRegion",
          currency: "EUR",
          model: "icpp",
          rateMode: "single",
          trxFeeEnabled: true,
          tier1UpToMillion: 5,
          tier2UpToMillion: 10,
          single: { mdrPercent: 4, trxCc: 0.3, trxCcNa: false, trxApm: 0.3, trxApmNa: false },
          tiers: [
            { mdrPercent: 0, trxCc: 0, trxCcNa: false, trxApm: 0, trxApmNa: false },
            { mdrPercent: 0, trxCc: 0, trxCcNa: false, trxApm: 0, trxApmNa: false },
            { mdrPercent: 0, trxCc: 0, trxCcNa: false, trxApm: 0, trxApmNa: false }
          ],
          // All three min-fee fields signal "no fee for this row".
          // Renderer must hide the MIN. TRX FEE column for section 1.1.
          minTrxFeeThresholdMillion: 0,
          minTrxFeePerTransaction: 0,
          minTrxFeeRowNa: false
        }
      ];

      const html = buildOfferPdfHtml(data);

      // Section 1.1 emitted, but its <thead> does NOT contain
      // MIN. TRANSACTION FEE column (hide-if-empty rule).
      expect(html).toMatch(/<h2>Additional Card Acquiring/);
      // Look inside section 1.1's thead specifically.
      const additionalSectionMatch = html.match(
        /<h2>Additional Card Acquiring[\s\S]*?<\/thead>/
      );
      expect(additionalSectionMatch).not.toBeNull();
      expect(additionalSectionMatch?.[0]).not.toContain("MIN. TRANSACTION FEE");
    });

    it("custom row REGION with HTML-injection chars is escaped in the output", () => {
      // The free-form region field is user-controlled. escapeHtml() in
      // the renderer must escape it; this test pins that behaviour so
      // a future refactor cannot accidentally drop the escape.
      const data = withBothRegions(buildBaseTemplateData());
      data.payinPricing.customRows = [
        {
          id: "row-test-injection",
          region: "<script>alert(1)</script>",
          currency: "EUR<\"&>",
          model: "icpp",
          rateMode: "single",
          trxFeeEnabled: true,
          tier1UpToMillion: 5,
          tier2UpToMillion: 10,
          single: { mdrPercent: 4, trxCc: 0.3, trxCcNa: false, trxApm: 0.3, trxApmNa: false },
          tiers: [
            { mdrPercent: 0, trxCc: 0, trxCcNa: false, trxApm: 0, trxApmNa: false },
            { mdrPercent: 0, trxCc: 0, trxCcNa: false, trxApm: 0, trxApmNa: false },
            { mdrPercent: 0, trxCc: 0, trxCcNa: false, trxApm: 0, trxApmNa: false }
          ],
          minTrxFeeThresholdMillion: 0,
          minTrxFeePerTransaction: 0,
          minTrxFeeRowNa: false
        }
      ];

      const html = buildOfferPdfHtml(data);

      // Raw script tag must NEVER appear in the output.
      expect(html).not.toContain("<script>alert(1)</script>");
      // The escaped form is present instead.
      expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
      // Currency-cell special chars escaped too.
      expect(html).toContain("EUR&lt;&quot;&amp;&gt;");
    });

    it("section 1.1 stays inline (no force-break) on LIGHT payin", () => {
      const data = withBothRegions(buildBaseTemplateData());
      // Light payin: standard single rates, no force-break needed.
      data.payinPricing.customRows = [
        {
          id: "row-test-light",
          region: "Crypto Rails",
          currency: "USDT",
          model: "blended",
          rateMode: "single",
          trxFeeEnabled: true,
          tier1UpToMillion: 5,
          tier2UpToMillion: 10,
          single: { mdrPercent: 6, trxCc: 0.5, trxCcNa: false, trxApm: 0.5, trxApmNa: false },
          tiers: [
            { mdrPercent: 0, trxCc: 0, trxCcNa: false, trxApm: 0, trxApmNa: false },
            { mdrPercent: 0, trxCc: 0, trxCcNa: false, trxApm: 0, trxApmNa: false },
            { mdrPercent: 0, trxCc: 0, trxCcNa: false, trxApm: 0, trxApmNa: false }
          ],
          minTrxFeeThresholdMillion: 0,
          minTrxFeePerTransaction: 0,
          minTrxFeeRowNa: false
        }
      ];

      const html = buildOfferPdfHtml(data);

      // Section 1.1 emitted.
      expect(html).toMatch(/<h2>Additional Card Acquiring/);
      // On LIGHT payin, the <tr> wrapping section 1.1 is a PLAIN
      // `<tr>` (no force-page-break-before class). Look backward at
      // most 1000 chars from the section's <h2> for a `<tr` opening
      // tag — that nearest opener must be plain.
      expect(html).toMatch(
        /<tr><td class="page-content-cell">[\s\S]{0,1000}?<h2>Additional Card Acquiring/
      );
      // And explicitly NOT the force-break variant.
      expect(html).not.toMatch(
        /<tr class="force-page-break-before">[\s\S]{0,1000}?<h2>Additional Card Acquiring/
      );
    });

    it("HEAVY payin WITH section 1.1 → Pay Out flows after 1.1 (NO force-break)", () => {
      // Regression for the double-page-break bug fixed 2026-05-14:
      // when both section 1.1 AND section 2 carry breakBefore=true,
      // Chrome's `page-break-before: always` rule fires twice — once
      // for 1.1 (page 1 → page 2) and again for section 2 (page 2 →
      // page 3), leaving page 2 mostly empty. Fix: when 1.1 exists,
      // only 1.1 carries the force-break; section 2 flows after it.
      const data = withBothRegions(buildBaseTemplateData());
      data.layout.payin.tableMode = "byRegionTiered";
      data.payinPricing.eu.rateMode = "tiered";
      data.payinPricing.ww.rateMode = "tiered";
      data.payinPricing.customRows = [
        {
          id: "row-heavy-with-additional",
          region: "Asia Bundle",
          currency: "USD",
          model: "icpp",
          rateMode: "single",
          trxFeeEnabled: true,
          tier1UpToMillion: 5,
          tier2UpToMillion: 10,
          single: { mdrPercent: 5, trxCc: 0.4, trxCcNa: false, trxApm: 0.4, trxApmNa: false },
          tiers: [
            { mdrPercent: 0, trxCc: 0, trxCcNa: false, trxApm: 0, trxApmNa: false },
            { mdrPercent: 0, trxCc: 0, trxCcNa: false, trxApm: 0, trxApmNa: false },
            { mdrPercent: 0, trxCc: 0, trxCcNa: false, trxApm: 0, trxApmNa: false }
          ],
          minTrxFeeThresholdMillion: 0,
          minTrxFeePerTransaction: 0,
          minTrxFeeRowNa: false
        }
      ];
      data.layout.payout.regionMode = "global";
      data.layout.payout.tableMode = "globalFlat";

      const html = buildOfferPdfHtml(data);

      // Section 1.1 still carries the break (it opens page 2).
      expect(html).toMatch(
        /<tr class="force-page-break-before">[\s\S]{0,1000}?<h2>Additional Card Acquiring/
      );
      // Section 2 (Pay Out) must NOT carry force-page-break — it flows
      // naturally beneath 1.1 on page 2. Looking forward from the
      // wrapping TR to the Pay Out <h2>, we use a negative-lookahead
      // `(?!<tr)` so the regex CANNOT cross into the next TR. That
      // pins each assertion to the IMMEDIATE TR wrapping section 2.
      expect(html).toMatch(
        /<tr><td class="page-content-cell">(?:(?!<tr)[\s\S])*?<h2>Card Acquiring [^<]*Pay Out/
      );
      expect(html).not.toMatch(
        /<tr class="force-page-break-before"><td class="page-content-cell">(?:(?!<tr)[\s\S])*?<h2>Card Acquiring [^<]*Pay Out/
      );
    });

    it("HEAVY payin WITHOUT section 1.1 → Pay Out still carries force-break (regression guard)", () => {
      // Companion to the previous test: when 1.1 is absent, section 2
      // is still the first content on page 2 and MUST carry the
      // force-page-break-before class. Guards against the fix above
      // being over-applied (e.g. dropping the break unconditionally).
      const data = withBothRegions(buildBaseTemplateData());
      data.layout.payin.tableMode = "byRegionTiered";
      data.payinPricing.eu.rateMode = "tiered";
      data.payinPricing.ww.rateMode = "tiered";
      // Explicitly no customRows → no section 1.1.
      data.payinPricing.customRows = undefined;
      data.layout.payout.regionMode = "global";
      data.layout.payout.tableMode = "globalFlat";

      const html = buildOfferPdfHtml(data);

      // No section 1.1 in the output.
      expect(html).not.toMatch(/<h2>Additional Card Acquiring/);
      // Section 2 ("Card Acquiring — Pay Out / Push to Card") carries
      // the force-page-break-before class.
      expect(html).toMatch(
        /<tr class="force-page-break-before"><td class="page-content-cell">[\s\S]{0,2000}?<h2>Card Acquiring [^<]*Pay Out/
      );
    });
  });
});
