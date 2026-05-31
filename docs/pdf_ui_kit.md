# PDF UI Kit (OFFER)

Date: 2026-05-30 (universal full-size layout; running header/footer moved to Puppeteer page templates)
Status: Active

## Purpose

Single source of truth for PDF visual language:

1. Color palette
2. Typography scale
3. Borders, spacing, radii
4. Reusable PDF primitives

This prevents drift between generated documents and approved reference PDFs.

## Source files

- `src/components/document-wizard/pdf-kit/tokens.ts`
- `src/components/document-wizard/pdf-kit/primitives.ts`
- `src/components/document-wizard/buildOfferPdfHtml.ts`
- `src/components/document-wizard/buildPdfUiKitHtml.ts`
- `server/modules/pdf/pdf.service.ts` — Puppeteer renderer + running header/footer page templates

## Token set

Primary active token profile: `OFFER_REFERENCE_TOKENS`.

Core visual intent:

1. Purple accent line and highlights (reference look)
2. Light table headers and soft borders
3. One universal full-size layout on A4 (no compact mode — more pages is fine)

## Primitives

1. `renderMetaItem`
2. `renderSectionHeader`
3. `renderFeesGrid`
4. `renderTermsGrid`
5. `buildPdfUiKitStyles`

(The running header + footer are Puppeteer page templates in `pdf.service.ts`, not pdf-kit primitives — the old in-HTML `renderFooter` was deleted 2026-05-30.)

## Preview / sandbox

UI Kit is internal and is not exposed in frontend workflow.
If needed for calibration, developers can render the kit page via `buildPdfUiKitHtml.ts` during development.

The kit page includes:

1. Header sample
2. Section/table sample
3. Fees cards sample
4. Terms grid sample
5. Color swatch panel for token calibration

**Wizard on-screen preview (`@media screen`)**: the wizard PreviewStep
renders the OFFER HTML in an iframe. The `@media screen` block in
`styles.ts` styles the document as ONE continuous A4 page
(`table.page-layout` frame, 20mm side insets) using the SAME print `pt`
font sizes — no per-element up-scaling — so the preview matches the
generated PDF 1:1. (Earlier per-element screen font overrides diverged
from print and overflowed the fixed-height meta cells; removed
2026-05-30.)

## Change rules

1. Tune colors and typography only via `tokens.ts` first.
2. Structural changes go through primitives.
3. Any visual decision change must be logged in `docs/decisions.md`.
