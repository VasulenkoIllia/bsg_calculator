import { escapeHtml } from "../../calculator/formatUtils.js";
import type { DocumentTemplatePayload } from "../types.js";
import { buildPartiesBlock } from "./parties.js";
import { AGREEMENT_SECTIONS } from "./sections.js";
import { buildSignatureBlock } from "./signatureBlock.js";

function renderParagraph(text: string): string {
  return `<p class="agreement-p">${escapeHtml(text)}</p>`;
}

// Sub-sections (e.g. "Tax Levy", "Binding Arbitration") are rendered as
// inline bold leads on the first paragraph of the block, matching the
// signed CEI / ZenCreator reference layout. Subsequent paragraphs in the
// block render as plain agreement paragraphs.
function renderSubsection(block: { subtitle: string; paragraphs: string[] }): string {
  if (block.paragraphs.length === 0) return "";

  const [first, ...rest] = block.paragraphs;
  const head = `<p class="agreement-p"><span class="agreement-lead">${escapeHtml(
    block.subtitle
  )}.</span> ${escapeHtml(first)}</p>`;
  const tail = rest.map(renderParagraph).join("");
  return head + tail;
}

function renderSection(section: (typeof AGREEMENT_SECTIONS)[number]): string {
  const blockHtml = section.blocks
    .map(block => {
      if (typeof block === "string") {
        return renderParagraph(block);
      }
      return renderSubsection(block);
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
