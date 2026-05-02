import { escapeHtml } from "../../../calculator/formatUtils.js";

export function renderSectionHeader(index: number, title: string, badge: string): string {
  return `<div class="section-header"><div class="section-title-wrap"><span class="section-index">${index}</span><h2>${escapeHtml(
    title
  )}</h2></div><span class="section-badge">${escapeHtml(badge)}</span></div>`;
}
