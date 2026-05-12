// Tiny HTML-safe utilities. Placed under `src/shared` (instead of the
// calculator UI layer) so the PDF builder pipeline — and a future
// Node-side server-render of the OFFER PDF — can import it without
// dragging the calculator components folder along.
//
// Pure, side-effect-free, DOM/React/Node-agnostic.

/**
 * HTML-escapes a string for safe interpolation into a static template.
 * Mirrors the standard 5-character escape set used by every common
 * templating engine. Intentionally does NOT handle Unicode normalisation
 * or attribute-context vs. text-context distinctions — callers must use
 * this only for places where either context is safe.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
