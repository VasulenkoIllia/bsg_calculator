/**
 * Shared frontend formatters.
 *
 * Extracted in Sprint 2.8.F.4 to consolidate the two `formatDate`
 * copies that lived in CompaniesPage and CompanyDetailPage. Future
 * listings (Sprint 3 Calculator Configs, Sprint 5 docs) should pull
 * from here rather than re-inventing.
 */

/**
 * Sprint 7.0: render an ISO timestamp as locale-formatted date + HH:MM.
 * Used by the listing tables where two saves on the same day are
 * easy to confuse without minute-precision context.
 *
 * Wrapped in try/catch so a malformed input (theoretically possible
 * from a misbehaving HubSpot sync) doesn't crash the row — we
 * display the raw string instead so the operator can still see
 * what's there.
 *
 * Format example: "19.05.2026, 21:59" (locale-driven; the browser
 * picks separators and hour notation).
 *
 * Sprint 9.L N1 — the original `formatDate` (date-only) variant was
 * removed; every call site now passes through `formatDateTime`. The
 * comment that referenced "the minute usually shows up elsewhere"
 * is stale: detail pages display the full timestamp too.
 */
export function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    // Compose date + short time. We use two `toLocale*` calls so the
    // locale controls each piece independently — some locales render
    // dd.mm.yyyy hh:mm with a comma separator, others with a space.
    return `${d.toLocaleDateString()}, ${d.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit"
    })}`;
  } catch {
    return iso;
  }
}

/**
 * Human-friendly label for the backend's documents.scope enum.
 *
 * Backend values: 'offer' | 'agreement' | 'offer_and_agreement'.
 * Frontend renders them across DocumentsListPage, DocumentViewPage,
 * and (eventually) Sprint 6's documents tab — centralised here so
 * the labels stay consistent.
 */
export function formatScopeLabel(scope: string): string {
  switch (scope) {
    case "offer":
      return "Offer";
    case "agreement":
      return "Agreement";
    case "offer_and_agreement":
      return "Offer + Agreement";
    default:
      return scope;
  }
}
