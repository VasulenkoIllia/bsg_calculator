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

function renderTermsItem(item: TermsGridItem): string {
  // Custom rows opt into a colour-coded value via `valueColor`. The
  // colour class wins over the default --text-primary; long bodies
  // wrap inside the cell via .terms-value-custom so the row grows
  // vertically instead of overflowing the column.
  const valueClasses = ["terms-value"];
  if (item.valueColor) {
    valueClasses.push(`terms-value-${item.valueColor}`);
    valueClasses.push("terms-value-custom");
  }
  const classAttr = valueClasses.join(" ");
  return `<div class="terms-item"><span class="terms-label">${escapeHtml(
    item.label
  )}</span><span class="${classAttr}">${renderTermsValueText(item.value)}</span></div>`;
}

export function renderTermsGrid(items: TermsGridItem[]): string {
  const rows: string[] = [];
  for (let index = 0; index < items.length; index += 2) {
    const left = items[index];
    const right = items[index + 1];

    rows.push(
      `<div class="terms-row">${renderTermsItem(left)}${
        right ? renderTermsItem(right) : '<div class="terms-item terms-item-empty"></div>'
      }</div>`
    );
  }

  return `<div class="terms-grid">${rows.join("")}</div>`;
}
