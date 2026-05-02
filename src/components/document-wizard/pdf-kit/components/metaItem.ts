import { escapeHtml } from "../../../calculator/formatUtils.js";
import type { MetaItem } from "../types.js";

export function renderMetaItem(item: MetaItem): string {
  return `<div class="meta-item"><span class="meta-label">${escapeHtml(item.label)}</span><span class="meta-value">${escapeHtml(
    item.value
  )}</span></div>`;
}
