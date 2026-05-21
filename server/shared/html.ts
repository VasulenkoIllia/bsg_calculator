/**
 * Sprint 9.L D2 — server-side HTML escape helpers.
 *
 * Mirrors the frontend's `src/shared/html.ts` (intentional duplicate
 * — the two trees stay independent so server bundles don't pull in
 * React-adjacent code). Used by the HubSpot Note body builder and
 * any future server-side template renderer.
 *
 * Pure, side-effect-free, Node-agnostic.
 */

/**
 * HTML-escapes a string for safe interpolation into a static template.
 * The 5-character escape set covers both text-content and double-
 * quoted attribute contexts. NOT a substitute for proper URL/JS
 * escaping in those respective contexts — see `escapeUrlAttr` for
 * the URL-attribute-only variant.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * URL-safe HTML attribute escape — per HTML5 spec, only `"` (the
 * attribute delimiter) and `&` (entity intro) must be escaped in a
 * double-quoted attribute value. We avoid the full `escapeHtml`
 * because it converts `'` → `&#39;`, which some URL parsers handle
 * less consistently than the minimal subset below.
 *
 * Callers should already have URL-percent-encoded any user-supplied
 * path segments; this helper guards only against breaking out of the
 * HTML attribute.
 */
export function escapeUrlAttr(rawUrl: string): string {
  return rawUrl.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}
