// Document-level legal defaults seeded into every DocumentTemplatePayload.
// Section 4 legal terms were previously hardcoded in `offerPdf/sections/terms.ts`
// and are now editable per contract from wizard Step 5 (Terms & Limitations).

export const DEFAULT_DOCUMENT_LEGAL_TERMS = {
  settlementNote: "Does not apply on weekends and bank holidays",
  clientType: "STD",
  restrictedJurisdictions: "OFAC, US"
} as const;
