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
      const subtitle = card.subtitle
        ? `<p class="fee-subtitle">${escapeHtml(card.subtitle)}</p>`
        : "";
      return `<article class="fee-card"><h3>${escapeHtml(card.title)}</h3><p class="fee-value">${renderFeeValueText(
        card.value
      )}</p>${subtitle}</article>`;
    })
    .join("")}</div>`;
}
