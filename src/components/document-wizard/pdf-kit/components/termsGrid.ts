import { escapeHtml } from "../../../calculator/formatUtils.js";
import type { TermsGridItem } from "../types.js";

export function renderTermsGrid(items: TermsGridItem[]): string {
  const rows: string[] = [];
  for (let index = 0; index < items.length; index += 2) {
    const left = items[index];
    const right = items[index + 1];

    rows.push(`<div class="terms-row"><div class="terms-item"><span class="terms-label">${escapeHtml(
      left.label
    )}</span><span class="terms-value">${escapeHtml(left.value)}</span></div>${
      right
        ? `<div class="terms-item"><span class="terms-label">${escapeHtml(right.label)}</span><span class="terms-value">${escapeHtml(
            right.value
          )}</span></div>`
        : '<div class="terms-item terms-item-empty"></div>'
    }</div>`);
  }

  return `<div class="terms-grid">${rows.join("")}</div>`;
}
