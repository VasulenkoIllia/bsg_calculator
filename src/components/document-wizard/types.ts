import type { AgreementParties, DocumentScope } from "./legalDefaults.js";

export type WizardStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type ValueMode = "value" | "waived" | "na" | "tbd";

// Colour choice for user-added custom Terms & Limitations blocks. Maps
// 1-to-1 to the `.terms-value-blue / -black / -orange` CSS classes in
// the PDF. Standard built-in fields are unaffected — they keep the
// default colour scheme.
export type CustomTermsItemColor = "blue" | "black" | "orange";

export interface CustomTermsItem {
  // Stable identifier so React can key the wizard list and so removing
  // / reordering items in the future stays predictable.
  id: string;
  // User-typed heading (e.g. "** Decline fee removal").
  label: string;
  // User-typed body text.
  value: string;
  // Body text colour — picked in the wizard. Heading keeps the default
  // blue label colour for consistency with built-in rows.
  color: CustomTermsItemColor;
}
export type PayinRegionMode = "both" | "euOnly" | "wwOnly" | "none";
export type PayinTableMode = "byRegionTiered" | "byRegionFlat" | "flatTiered" | "flatSingle";
export type PayoutRegionMode = "global" | "none";
export type PayoutTableMode = "globalTiered" | "globalFlat";

export interface DocumentWizardLayout {
  source: "calculator" | "manual" | "clone";
  payin: {
    regionMode: PayinRegionMode;
    tableMode: PayinTableMode;
  };
  payout: {
    regionMode: PayoutRegionMode;
    tableMode: PayoutTableMode;
  };
}

export interface DocumentWizardValueModes {
  accountSetupFee?: ValueMode;
  refundCost?: ValueMode;
  disputeCost?: ValueMode;
  threeDsFee?: ValueMode;
  settlementFee?: ValueMode;
  monthlyMinimumFee?: ValueMode;
  rollingReserveCap?: ValueMode;
  // Transaction Limits — every limit can be rendered as a number,
  // N/A or TBD via the wizard. The PDF chooses what to print using
  // resolveModeValue. If mode is value/undefined and the underlying
  // number is empty/0, the corresponding row hides — explicit user
  // choice only, no auto-defaults.
  collectionLimitMin?: ValueMode;
  collectionLimitMax?: ValueMode;
  payoutLimitMin?: ValueMode;
  payoutLimitMax?: ValueMode;
}

// Optional operator-entered custom note (a second subtitle line) for
// each section-3 fee card. Keys mirror DocumentWizardValueModes so a
// fee's mode + note pair line up. All optional → existing saved
// payloads stay valid.
export interface DocumentWizardFeeNotes {
  accountSetupFee?: string;
  refundCost?: string;
  disputeCost?: string;
  threeDsFee?: string;
  settlementFee?: string;
  monthlyMinimumFee?: string;
  // Operator memo under the FAILED TRANSACTION CHARGING card.
  failedTrx?: string;
}

export interface DocumentHeaderMetaDraft {
  documentType: string;
  documentNumber: string;
  documentDateIso: string;
  // "Offer valid till" — number of days the offer is valid FROM
  // `documentDateIso`. The valid-till DATE is derived at render time (see
  // src/shared/offerValidity.ts) so it tracks the document date. Only
  // surfaced when documentScope === "offer". OPTIONAL on purpose: documents
  // stored before this feature omit it — the badge + PDF line are suppressed
  // for them (see hasExplicitOfferValidity), and reads coerce via
  // resolveOfferValidDays(). New documents are seeded with the default.
  offerValidDays?: number;
  collectionModel: string;
  collectionFrequency: string;
}

export interface DocumentTemplatePayload {
  header: DocumentHeaderMetaDraft;
  documentScope: DocumentScope;
  agreementParties: AgreementParties;
  layout: DocumentWizardLayout;
  valueModes?: DocumentWizardValueModes;
  feeNotes?: DocumentWizardFeeNotes;
  calculatorType: {
    payin: boolean;
    payout: boolean;
  };
  payin: {
    euPercent: number;
    wwPercent: number;
    ccPercent: number;
    apmPercent: number;
  };
  contractSummary: {
    settlementPeriod: string;
    collectionLimitMin: number;
    collectionLimitMax: number;
    payoutLimitMin: number;
    payoutLimitMax: number | null;
    rollingReservePercent: number;
    rollingReserveHoldDays: number;
    rollingReserveCap: number | null;
    payoutMinimumFeeMode: "overall" | "byRegion";
    payoutMinimumFeeThresholdMillion: number;
    payoutMinimumFeePerTransaction: number;
    payoutMinimumFeeEuThresholdMillion: number;
    payoutMinimumFeeEuPerTransaction: number;
    payoutMinimumFeeWwThresholdMillion: number;
    payoutMinimumFeeWwPerTransaction: number;
    // Per-region "N/A" toggles for the MIN. TRANSACTION FEE column on
    // the payin (Card Acquiring) table. When true, the corresponding
    // region row renders the literal "N/A" instead of the threshold-
    // based value, regardless of payoutMinimumFeeMode.
    payoutMinimumFeeEuNa: boolean;
    payoutMinimumFeeWwNa: boolean;
    accountSetupFee: number;
    refundCost: number;
    disputeCost: number;
    settlementNote: string;
    clientType: string;
    restrictedJurisdictions: string;
    // User-defined extra rows appended to the Terms & Limitations grid.
    // They follow the same 2-column layout and page-break behaviour as
    // built-in rows. Empty array means no custom rows.
    customTermsItems: CustomTermsItem[];
    // Optional free-form note rendered under the payin (Card Acquiring)
    // and payout (Pay Out) tables in the OFFER PDF. Toggled per section.
    // When the toggle is off (default) or the text is empty, no note
    // is rendered. Colour matches the muted --text-light gray used by
    // other secondary text.
    payinCustomNoteEnabled: boolean;
    payinCustomNoteText: string;
    payoutCustomNoteEnabled: boolean;
    payoutCustomNoteText: string;
  };
  payinPricing: {
    eu: PayinRegionPricing;
    ww: PayinRegionPricing;
    // Optional ad-hoc rows appended to the Payin table after the
    // standard EU / WW rows. Operator-driven; calculator does not
    // emit these. See `PayinCustomRow` below. Optional (undefined ⇒
    // no custom rows) keeps payloads saved before 2026-05-14
    // deserialising cleanly.
    customRows?: PayinCustomRow[];
  };
  payoutPricing: {
    rateMode: "single" | "tiered";
    tier1UpToMillion: number;
    tier2UpToMillion: number;
    single: PayoutFeeBlock;
    tiers: PayoutFeeBlock[];
  };
  toggles: {
    settlementIncluded: boolean;
    payoutMinimumFeeEnabled: boolean;
    payoutMinimumFeePerTransaction: number;
    // "N/A" toggle for the MINIMUM FEE column on the payout (Pay Out)
    // table. When true, the cell renders "N/A".
    payoutMinimumFeePerTransactionNa: boolean;
    threeDsEnabled: boolean;
    threeDsRevenuePerSuccessfulTransaction: number;
    settlementFeeEnabled: boolean;
    settlementFeeRatePercent: number;
    monthlyMinimumFeeEnabled: boolean;
    monthlyMinimumFeeAmount: number;
    failedTrxEnabled: boolean;
    // Wizard-only display mode for the FAILED TRANSACTION CHARGING card.
    // "free" → "€0.00"; "overLimitOnly" → "Under limit only N.NN%";
    // "allFailedVolume" → "All Failed volume". The calculator's own
    // FailedTrxChargingMode stays 2-valued (no "free") and is FROZEN —
    // "free" never flows back to the calculator (fromCalculator is
    // calc → wizard, one-way).
    failedTrxMode: "overLimitOnly" | "allFailedVolume" | "free";
    failedTrxOverLimitThresholdPercent: number;
  };
}

// Per-region payin pricing block (extracted so single + tiers share the
// same shape and the new N/A flags live next to their numeric siblings).
export interface PayinFeeBlock {
  mdrPercent: number;
  trxCc: number;
  // "N/A" toggle for the C/D transaction fee. Renders "C/D: N/A" in PDF.
  trxCcNa: boolean;
  trxApm: number;
  // "N/A" toggle for the APM transaction fee. Renders "APM: N/A" in PDF.
  trxApmNa: boolean;
}

export interface PayinRegionPricing {
  model: "icpp" | "blended";
  rateMode: "single" | "tiered";
  trxFeeEnabled: boolean;
  tier1UpToMillion: number;
  tier2UpToMillion: number;
  single: PayinFeeBlock;
  // Fixed-length tuple to match the calculator domain's
  // `PayinRegionPricingConfig.tiers` shape (also a 3-element tuple).
  // Prevents accidental zero-length / oversized tier arrays.
  tiers: [PayinFeeBlock, PayinFeeBlock, PayinFeeBlock];
  // NOTE: Dedicated Countries (UK + Switzerland) is intentionally
  // calculator-only — see `PayinRegionPricingConfig.dedicatedCountries`
  // in `domain/calculator/zone3/pricingConfiguration.ts`. The wizard
  // payload deliberately does NOT mirror it: the feature affects the
  // calculator's internal scheme-fee math only, and never surfaces in
  // the OFFER PDF (no UI, no rendered row). Keeping it out of the
  // payload prevents accidental wiring into the wizard / PDF layer.
}

// Payout pricing block — single trx fee per row plus its N/A toggle.
export interface PayoutFeeBlock {
  mdrPercent: number;
  trxFee: number;
  // "N/A" toggle for the payout transaction fee. Renders "N/A" in PDF.
  trxFeeNa: boolean;
}

// Ad-hoc Payin row appended to the table after the standard EU / WW
// regions. Operator-only feature (added 2026-05-14). Designed to let
// sales describe one-off pricing arrangements (e.g. "Russia bundle",
// "Crypto rails") that don't fit the standard EU/WW region split.
//
// Reuses the standard `PayinFeeBlock` shape for `single` and `tiers`
// so the existing renderers (`renderTrxFeeCell`, tier-color logic,
// MDR/TRX cells) accept these rows without special-casing.
//
// METHODS column (Credit/Debit + APM) is intentionally hardcoded by
// the renderer to match the standard rows — no per-row override.
// REGION + CURRENCY are free-form strings.
//
// MIN. TRANSACTION FEE uses its own per-row threshold/fee/N/A fields
// rather than reading from `contractSummary` (which is global to all
// standard regions). When `minTrxFeeRowNa = true`, the cell renders
// the muted "N/A" label. When threshold/fee both > 0, renders the
// two-line `≤Xm: €Y / >Xm: N/A` format. When both are 0 and not N/A
// — the cell stays empty (same hide-when-empty logic as standard).
export interface PayinCustomRow {
  // Stable identifier for React keys + delete operations. Generated
  // client-side on row creation (e.g. `crypto.randomUUID()` or a
  // monotonic counter). Never sent to HubSpot.
  id: string;

  // Free-form REGION label (e.g. "Russia", "LATAM bundle"). Displayed
  // with the same `● ` bullet as standard EU / WW rows.
  region: string;

  // Free-form CURRENCY label (e.g. "EUR", "USDT", "USD"). Defaults to
  // "EUR" on row creation.
  currency: string;

  // Pricing model + rate mode — same enums as PayinRegionPricing.
  model: "icpp" | "blended";
  rateMode: "single" | "tiered";
  trxFeeEnabled: boolean;

  // Tier boundaries (used only when rateMode === "tiered").
  tier1UpToMillion: number;
  tier2UpToMillion: number;

  // Single-rate block — reused PayinFeeBlock shape.
  single: PayinFeeBlock;

  // Tiered blocks — fixed-length tuple of 3, matching PayinRegionPricing.
  tiers: [PayinFeeBlock, PayinFeeBlock, PayinFeeBlock];

  // MIN. TRANSACTION FEE inputs (mirrors the structure used by
  // standard rows in `contractSummary.payoutMinimumFee*` but stored
  // per-custom-row).
  minTrxFeeThresholdMillion: number;
  minTrxFeePerTransaction: number;
  // Whole-cell N/A toggle. When true the cell renders muted "N/A"
  // regardless of threshold / fee values.
  minTrxFeeRowNa: boolean;
}
