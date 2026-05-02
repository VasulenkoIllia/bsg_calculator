import { escapeHtml } from "../../calculator/formatUtils.js";
import type { DocumentTemplatePayload } from "../types.js";
import { buildPartiesBlock } from "./parties.js";
import { AGREEMENT_SECTIONS } from "./sections.js";
import { buildSignatureBlock } from "./signatureBlock.js";

function renderParagraph(text: string): string {
  return `<p class="agreement-p">${escapeHtml(text)}</p>`;
}

function renderSection(section: (typeof AGREEMENT_SECTIONS)[number]): string {
  const blockHtml = section.blocks
    .map(block => {
      if (typeof block === "string") {
        return renderParagraph(block);
      }
      const subParagraphs = block.paragraphs.map(renderParagraph).join("");
      return `<h3 class="agreement-h3">${escapeHtml(block.subtitle)}</h3>${subParagraphs}`;
    })
    .join("");

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
