/**
 * Shared frontend formatters.
 *
 * Extracted in Sprint 2.8.F.4 to consolidate the two `formatDate`
 * copies that lived in CompaniesPage and CompanyDetailPage. Future
 * listings (Sprint 3 Calculator Configs, Sprint 5 docs) should pull
 * from here rather than re-inventing.
 */

/**
 * Render an ISO timestamp as a locale-formatted date. Wrapped in
 * try/catch so a malformed input (theoretically possible from a
 * misbehaving HubSpot sync) doesn't crash the row — we display the
 * raw string instead so the operator can still see what's there.
 *
 * Intentionally calls `toLocaleDateString()` without a locale arg —
 * the browser's locale wins. If we ever need a fixed locale (e.g.
 * for printing receipts), introduce a second helper rather than
 * changing this one.
 */
export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString();
  } catch {
    return iso;
  }
}
