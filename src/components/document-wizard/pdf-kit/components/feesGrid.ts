import { escapeHtml } from "../../../calculator/formatUtils.js";
import type { FeeCardItem } from "../types.js";

export function renderFeesGrid(items: FeeCardItem[]): string {
  return `<div class="fees-grid">${items
    .map(
      card => `<article class="fee-card"><h3>${escapeHtml(card.title)}</h3><p class="fee-value">${escapeHtml(
        card.value
      )}</p><p class="fee-subtitle">${escapeHtml(card.subtitle)}</p></article>`
    )
    .join("")}</div>`;
}
