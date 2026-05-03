import { escapeHtml } from "../../calculator/formatUtils.js";
import type { DocumentTemplatePayload } from "../types.js";
import { buildPartiesBlock } from "./parties.js";
import {
  AGREEMENT_SECTIONS,
  type AgreementBlock,
  type AgreementListItem,
  type AgreementSection
} from "./sections.js";
import { buildSignatureBlock } from "./signatureBlock.js";

function renderParagraph(text: string): string {
  return `<p class="agreement-p">${escapeHtml(text)}</p>`;
}

// Inline bold lead-in (used for Payment subsections: "Tax Levy.", "Taxes Generally.", …).
function renderLead(subtitle: string, text: string): string {
  return `<p class="agreement-p"><span class="agreement-lead">${escapeHtml(
    subtitle
  )}.</span> ${escapeHtml(text)}</p>`;
}

// Standalone uppercase subsection heading (used for Dispute Resolution sub-headings).
function renderHeading(text: string): string {
  return `<h3 class="agreement-h3">${escapeHtml(text)}</h3>`;
}

function renderListItem(item: AgreementListItem): string {
  if (typeof item === "string") {
    return `<li>${escapeHtml(item)}</li>`;
  }
  const subItems = item.subItems
    .map(sub => `<li>${escapeHtml(sub)}</li>`)
    .join("");
  return `<li>${escapeHtml(item.text)}<ul class="agreement-sublist">${subItems}</ul></li>`;
}

function renderList(items: AgreementListItem[]): string {
  return `<ul class="agreement-list">${items.map(renderListItem).join("")}</ul>`;
}

function renderBlock(block: AgreementBlock): string {
  if (typeof block === "string") return renderParagraph(block);
  switch (block.kind) {
    case "paragraph":
      return renderParagraph(block.text);
    case "lead":
      return renderLead(block.subtitle, block.text);
    case "heading":
      return renderHeading(block.text);
    case "list":
      return renderList(block.items);
  }
}

function renderSection(section: AgreementSection): string {
  const blockHtml = section.blocks.map(renderBlock).join("");
  return `<section class="agreement-section">
    <h2 class="agreement-h2">${escapeHtml(section.title)}</h2>
    ${blockHtml}
  </section>`;
}

export function buildAgreementBodyHtml(payload: DocumentTemplatePayload): string {
  const parties = buildPartiesBlock(payload);
  const sections = AGREEMENT_SECTIONS.map(renderSection).join("");
  const signature = buildSignatureBlock(payload);

  return `<div class="agreement-body">
    ${parties}
    ${sections}
    ${signature}
  </div>`;
}
