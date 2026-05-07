import { escapeHtml } from "../../../calculator/formatUtils.js";
import type { TermsGridItem } from "../types.js";

// Render the value text. When it equals the literal "N/A" sentinel,
// wrap it in `.value-na` so the cell reads in muted gray — the same
// rule applied to fee/min-fee cells in the pricing tables. Other
// values (numbers, "TBD", free text) render in default colour.
function renderTermsValueText(value: string): string {
  if (value === "N/A") return `<span class="value-na">N/A</span>`;
  return escapeHtml(value);
}

export function renderTermsGrid(items: TermsGridItem[]): string {
  const rows: string[] = [];
  for (let index = 0; index < items.length; index += 2) {
    const left = items[index];
    const right = items[index + 1];

    rows.push(`<div class="terms-row"><div class="terms-item"><span class="terms-label">${escapeHtml(
      left.label
    )}</span><span class="terms-value">${renderTermsValueText(left.value)}</span></div>${
      right
        ? `<div class="terms-item"><span class="terms-label">${escapeHtml(right.label)}</span><span class="terms-value">${renderTermsValueText(
            right.value
          )}</span></div>`
        : '<div class="terms-item terms-item-empty"></div>'
    }</div>`);
  }

  return `<div class="terms-grid">${rows.join("")}</div>`;
}
