# PDF UI Kit (OFFER)

Date: 2026-05-02
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

## Token set

Primary active token profile: `OFFER_REFERENCE_TOKENS`.

Core visual intent:

1. Purple accent line and highlights (reference look)
2. Light table headers and soft borders
3. Compact legal-document density on A4

## Primitives

1. `renderMetaItem`
2. `renderSectionHeader`
3. `renderFeesGrid`
4. `renderTermsGrid`
5. `renderFooter`
6. `buildPdfUiKitStyles`

## Preview / sandbox

UI Kit is internal and is not exposed in frontend workflow.
If needed for calibration, developers can render the kit page via `buildPdfUiKitHtml.ts` during development.

The kit page includes:

1. Header sample
2. Section/table sample
3. Fees cards sample
4. Terms grid sample
5. Color swatch panel for token calibration

## Change rules

1. Tune colors and typography only via `tokens.ts` first.
2. Structural changes go through primitives.
3. Any visual decision change must be logged in `docs/decisions.md`.
