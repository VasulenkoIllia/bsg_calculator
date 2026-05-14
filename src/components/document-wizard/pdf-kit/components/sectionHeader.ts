import { escapeHtml } from "../../../../shared/html.js";

// Section-header primitive. `index` is rendered into the small
// numbered badge on the left ("1", "2", "3", "4" for the canonical
// sections). 2026-05-14: signature widened to `number | string` so
// the Additional Card Acquiring section can carry a string `"1.1"`
// label (visually marks it as a sub-section of section 1). Numeric
// callers continue to work unchanged.
export function renderSectionHeader(
  index: number | string,
  title: string,
  badge: string
): string {
  return `<div class="section-header"><div class="section-title-wrap"><span class="section-index">${escapeHtml(
    String(index)
  )}</span><h2>${escapeHtml(title)}</h2></div><span class="section-badge">${escapeHtml(badge)}</span></div>`;
}
