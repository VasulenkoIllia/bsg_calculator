// Document-level legal defaults seeded into every DocumentTemplatePayload.
// Section 4 legal terms were previously hardcoded in `offerPdf/sections/terms.ts`
// and are now editable per contract from wizard Step 5 (Terms & Limitations).
//
// AGREEMENT scope adds counterparty placeholders rendered by the
// `agreementPdf/` module (parties block + signature block).

export const DEFAULT_DOCUMENT_LEGAL_TERMS = {
  settlementNote: "Does not apply on weekends and bank holidays",
  clientType: "STD",
  restrictedJurisdictions: "OFAC, US"
} as const;

export type DocumentScope = "offer" | "agreement" | "offerAndAgreement";

export const DEFAULT_DOCUMENT_SCOPE: DocumentScope = "offer";

// Static identity of BSG (always the same across contracts).
export const BSG_ENTITY = {
  name: "Black Stripe Group LTD",
  jurisdiction: "the United Kingdom",
  registeredOffice: "Office 16252, 182–184 High Street North, East Ham, London, E6 2JA, United Kingdom",
  shortLabel: "BSG"
} as const;

// Defaults for the second Service Provider entity (acquiring/processing/settling).
// Editable per contract via wizard "Parties & Signatures" step.
export const DEFAULT_AGREEMENT_PARTIES = {
  merchantLegalName: "",
  merchantJurisdiction: "",
  merchantRegisteredAddress: "",
  serviceProviderCoEntityName: "KASEF PAY INC",
  serviceProviderCoEntityJurisdiction: "British Columbia, Canada",
  serviceProviderCoEntityAddress: "3200 - 650 West Georgia Street, Vancouver BC V6B 4P7, Canada",
  serviceProviderCoEntityShortLabel: "KASEF PAY"
} as const;

export type AgreementParties = typeof DEFAULT_AGREEMENT_PARTIES;

// Placeholders rendered when a party field is left blank (taken from the
// source MSA template). Keeps the document usable as a draft.
export const AGREEMENT_PARTY_PLACEHOLDERS = {
  merchantLegalName: "[Merchant legal name]",
  merchantJurisdiction: "[*]",
  merchantRegisteredAddress: "[*]"
} as const;

// Document type labels per scope (per spec section 6.1).
// One canonical label per scope — used both as the dropdown option in Step 1
// and as the rendered DOCUMENT TYPE in the PDF meta block.
export const DOCUMENT_TYPE_LABELS = {
  offer: "Commercial Pricing Schedule",
  agreement: "Commercial Pricing Schedule Terms of Agreement",
  offerAndAgreement: "Commercial Pricing Schedule + Terms of Agreement"
} as const;

export const DOCUMENT_TYPE_HINTS: Record<DocumentScope, string> = {
  offer: "Sections 1–4 with pricing tables. 1–3 pages.",
  agreement: "Long-form Master Service Agreement with parties and signatures. ~9 pages.",
  offerAndAgreement:
    "Sections 1–4 plus the long-form Service Agreement. ~11 pages — matches ZenCreator / ATOM / CEI sample bundles."
};

// Resolve scope from the rendered document-type label. Used when external
// systems carry a label rather than a scope code.
export function resolveScopeFromDocumentType(documentType: string): DocumentScope {
  for (const [scope, label] of Object.entries(DOCUMENT_TYPE_LABELS)) {
    if (label === documentType) return scope as DocumentScope;
  }
  return DEFAULT_DOCUMENT_SCOPE;
}
