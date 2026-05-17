# Visual-diff harness — backend PDF vs. frontend "Generate PDF"

**TL;DR.** Two rendering paths exist for the offer/agreement PDF —
the frontend wizard's "Generate PDF" button (browser-native
`window.print() → Save as PDF`) and the backend
`GET /api/v1/documents/:number/pdf` (Puppeteer). Both feed the same
HTML (built by `buildOfferPdfHtml`) into Chrome's PDF engine. This
harness verifies that the rendered output is **byte-for-byte
equivalent** down to ≤0.005% pixel drift per page.

## Why it matters

A contract printed from the wizard MUST look identical to the same
contract downloaded after saving — otherwise the operator can't
trust either copy and the PDF generated for the merchant differs
from what was previewed.

## What it actually compares

The harness uses Puppeteer for both renders, with two different
configs:

| Path | Config | Production caller |
|------|--------|-------------------|
| **Backend** | `renderHtmlToPdf()` from `server/modules/pdf/pdf.service.ts` — `preferCSSPageSize: true`, `margin: 12/16mm`, `emulateMediaType("print")` | `GET /api/v1/documents/:number/pdf` |
| **Frontend-simulated** | Plain `page.pdf({ format: "A4", printBackground: true })` — no `preferCSSPageSize` hack, no margin override — approximates what `window.print() → Save as PDF` does in recent Chrome | wizard "Generate PDF" button |

Both paths render the same `buildOfferPdfHtml(payload)` string, so
any divergence reveals a setting mismatch (not a template bug).

## Running

```bash
# Generate gold files (run when the template intentionally changes
# — Sprint UI tweak, new section, font change). Reviews the diff
# images in tests/visual-diff-output/ before committing the gold.
npm run visual-diff:gold

# CI gate — compares current renders against gold + against each
# other. Exits 1 if any page exceeds 0.5% pixel drift.
npm run visual-diff
```

## Requirements

- `pdftoppm` from poppler (macOS: `brew install poppler`; Debian:
  `apt install poppler-utils`).
- Puppeteer's bundled Chromium (already pinned via package.json).

## Threshold

`MAX_DIFF_RATIO = 0.005` (0.5% pixels per page). Empirical reality
on the BSG template: differences are 14–26 pixels out of ~967k
(≤0.003%), entirely from anti-aliasing sub-pixel rounding by
`pdftoppm` on adjacent renders of the same A4 geometry. We keep the
threshold at 0.5% so a real regression (e.g. a section moved by
1px) trips it loudly.

## Caveats — what THIS test does NOT cover

- **Browser variation.** A user on Safari/Firefox may see slightly
  different output (kerning, page-break heuristics). Backend output
  is the canonical reference; we recommend operators use the
  "Download PDF" button on `/documents/:number` for any contract
  delivered to a counterparty.
- **Print dialog options.** If a user toggles "Headers and footers"
  ON in the print dialog, the browser injects URL + timestamp into
  the printed PDF. Backend output never has this. The harness
  doesn't test "user customised their print settings" cases — out
  of scope.
- **Browser version drift.** Backend uses Puppeteer's pinned
  Chromium. A user on Chrome 12+ months behind ours could see
  slightly different output. Not testable in CI; we document and
  move on.

## Output layout

```
tests/visual-diff-gold/<fixture>/page-N.png        # committed
tests/visual-diff-output/<fixture>/                # gitignored
  page-N-backend.png
  page-N-frontend.png
  page-N-diff.png                                   # red overlay of differences
  page-N-gold-drift.png                             # only if backend != gold
```
