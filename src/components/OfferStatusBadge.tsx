import {
  formatIsoDdMmYyyy,
  hasExplicitOfferValidity,
  isOfferExpired,
  offerValidTillIso,
  readOfferValidityHeader
} from "../shared/offerValidity.js";

// Colored offer-validity indicator for the APP (NOT the PDF — a generated
// PDF is static). Green "Valid till DD.MM.YYYY" while the offer is live,
// red "Expired DD.MM.YYYY" once today is past the valid-till date. Two
// states only. The valid-till date is DERIVED from the document date + the
// stored day count, so it stays correct as time passes.
//
// Render only for offer-scope documents (gated at the call site).
// `offerValidDays` is typed `unknown` because it is read straight from a
// stored payload that may predate the field — the util coerces a missing
// value to the default.
export function OfferStatusBadge({
  documentDateIso,
  offerValidDays,
  className = ""
}: {
  documentDateIso: string;
  offerValidDays: unknown;
  className?: string;
}) {
  const validTill = formatIsoDdMmYyyy(offerValidTillIso(documentDateIso, offerValidDays));
  const expired = isOfferExpired(documentDateIso, offerValidDays);
  return (
    <span
      className={[
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        expired ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700",
        className
      ]
        .filter(Boolean)
        .join(" ")}
      title={expired ? `Offer expired on ${validTill}` : `Offer valid till ${validTill}`}
    >
      {expired ? `Expired ${validTill}` : `Valid till ${validTill}`}
    </span>
  );
}

// Call-site wrapper: takes a document's `scope` + raw `payload` and renders
// the OfferStatusBadge ONLY for offer-scope documents whose payload exposes
// a document date. Encapsulates the scope gate + the payload-shape read so
// every page (detail, list, company tab) stays a one-liner. Renders nothing
// otherwise (non-offer scope, agreement bundle, or unreadable payload).
export function DocumentOfferStatus({
  scope,
  payload,
  className = ""
}: {
  scope: string;
  payload: unknown;
  className?: string;
}) {
  if (scope !== "offer") return null;
  const header = readOfferValidityHeader(payload);
  // Suppress for documents without an EXPLICIT validity (e.g. offers stored
  // before this feature) — they are not retroactively labeled valid/expired.
  if (!header || !hasExplicitOfferValidity(header.offerValidDays)) return null;
  return (
    <OfferStatusBadge
      documentDateIso={header.documentDateIso}
      offerValidDays={header.offerValidDays}
      className={className}
    />
  );
}
