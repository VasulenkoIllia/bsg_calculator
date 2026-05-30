import { escapeHtml } from "../../../../shared/html.js";
import type { FeeCardItem } from "../types.js";

// Render the fee value. When it equals the literal "N/A" sentinel
// (because the user picked the N/A mode in the wizard), wrap it in
// `.value-na` so the card reads in muted gray — same rule that
// applies to fee cells in the pricing tables.
function renderFeeValueText(value: string): string {
  if (value === "N/A") return `<span class="value-na">N/A</span>`;
  return escapeHtml(value);
}

export function renderFeesGrid(items: FeeCardItem[]): string {
  return `<div class="fees-grid">${items
    .map(card => {
      // The optional custom note renders on its own line under the
      // standard subtitle (same .fee-subtitle styling). Either line may
      // be present independently.
      const note = card.subtitleNote
        ? `<p class="fee-subtitle">${escapeHtml(card.subtitleNote)}</p>`
        : "";
      const subtitle = card.subtitle
        ? `<p class="fee-subtitle">${escapeHtml(card.subtitle)}</p>`
        : "";
      return `<article class="fee-card"><h3>${escapeHtml(card.title)}</h3><p class="fee-value">${renderFeeValueText(
        card.value
      )}</p>${subtitle}${note}</article>`;
    })
    .join("")}</div>`;
}
