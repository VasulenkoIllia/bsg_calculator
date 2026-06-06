// Offer validity helpers — the "Offer valid till" feature.
//
// A Commercial Pricing Schedule offer is valid for a number of days from
// its Document Date. We store the chosen DAY COUNT (`offerValidDays`) on
// the document header and DERIVE the valid-till date at render time, so it
// always tracks the current Document Date (change the date -> the valid-
// till date recomputes).
//
// Pure, timezone-safe string math: dates are ISO `YYYY-MM-DD` and we only
// ever parse/add via `Date.UTC` — never `new Date(isoString)`, which is
// parsed in the LOCAL zone and can shift the day across a UTC boundary.
// Zero React / PDF-kit deps, so the wizard, the PDF builder, and the app
// pages (`src/pages/**`) can all import this leaf module.

export const OFFER_VALID_DAYS_DEFAULT = 15;

// Quick-select presets offered in the wizard Step-1 control (alongside a
// free numeric input).
export const OFFER_VALID_DAYS_PRESETS = [7, 15, 30] as const;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

// True only when a document carries an EXPLICIT, usable validity (a finite
// number >= 1). Documents stored before this feature have no `offerValidDays`,
// so this is false for them — callers use it to SUPPRESS the validity badge +
// PDF line on old offers (no retroactive "Expired" labeling). New documents
// are seeded with the default, so they pass.
export function hasExplicitOfferValidity(offerValidDays: unknown): boolean {
  return (
    typeof offerValidDays === "number" &&
    Number.isFinite(offerValidDays) &&
    offerValidDays >= 1
  );
}

// Coerce any stored value to a usable day count (>= 1). Returns the default
// for a missing / invalid value (incl. fractional < 1, e.g. 0.5 -> default),
// so every read site is safe without a payload migration.
export function resolveOfferValidDays(raw: unknown): number {
  return hasExplicitOfferValidity(raw) ? Math.floor(raw as number) : OFFER_VALID_DAYS_DEFAULT;
}

// ISO `YYYY-MM-DD` + N days -> ISO `YYYY-MM-DD`. Returns the input
// unchanged when it is not a valid ISO date (mirrors the defensive guard
// in offerPdf/formatters.ts:formatDisplayDate).
export function addDaysToIso(iso: string, days: number): string {
  const match = ISO_DATE_RE.exec(iso);
  if (!match) return iso;
  const base = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const shifted = new Date(base + days * MS_PER_DAY);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// The derived "valid till" ISO date = Document Date + offerValidDays
// (with back-compat day-count resolution).
export function offerValidTillIso(documentDateIso: string, offerValidDays: unknown): string {
  return addDaysToIso(documentDateIso, resolveOfferValidDays(offerValidDays));
}

// Today as ISO `YYYY-MM-DD` in UTC, so validity comparisons are stable
// regardless of the viewer's timezone.
function todayIsoUtc(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// The offer is valid THROUGH the end of its valid-till day; it is expired
// once today is strictly past it. Zero-padded ISO strings compare
// lexicographically, so a plain `>` is correct.
export function isOfferExpired(
  documentDateIso: string,
  offerValidDays: unknown,
  todayIso: string = todayIsoUtc()
): boolean {
  return todayIso > offerValidTillIso(documentDateIso, offerValidDays);
}

// ISO `YYYY-MM-DD` -> display `DD.MM.YYYY` (matches the PDF cover format
// produced by offerPdf/formatters.ts:formatDisplayDate). Kept local here
// so `src/pages/**` can format without importing the PDF kit.
export function formatIsoDdMmYyyy(iso: string): string {
  const match = ISO_DATE_RE.exec(iso);
  if (!match) return iso;
  return `${match[3]}.${match[2]}.${match[1]}`;
}

// Safely pluck the validity-relevant header fields from a stored document
// payload (typed `unknown` on the wire — the document-list rows carry the
// raw JSONB). Returns null when the shape is not a wizard payload with a
// header + document date, so call sites can skip the badge gracefully.
// `offerValidDays` is passed through raw; resolveOfferValidDays handles the
// missing/old-payload case at use.
export function readOfferValidityHeader(
  payload: unknown
): { documentDateIso: string; offerValidDays: unknown } | null {
  if (!payload || typeof payload !== "object") return null;
  const header = (payload as { header?: unknown }).header;
  if (!header || typeof header !== "object") return null;
  const documentDateIso = (header as { documentDateIso?: unknown }).documentDateIso;
  if (typeof documentDateIso !== "string") return null;
  return {
    documentDateIso,
    offerValidDays: (header as { offerValidDays?: unknown }).offerValidDays
  };
}
