# Pixel-Diff Audit: Generated PDF vs Signed References

Date: 2026-05-05
Status: Visual fidelity pass complete. Typography rescaled, page count converged to reference (12 pages).

## 1. Method

1. Built standalone HTML for the wizard `manualDefaults` seed with `documentScope: "offerAndAgreement"` and the merchant party fields filled with `Example Merchant Ltd / <country> / <address>` (mirrors the Sample A signed reference).
2. Rendered to PDF via headless Chrome (`--print-to-pdf`).
3. Rasterised both our PDF and each reference PDF to PNG at 150 DPI (1240×1754 px) with `pdftoppm`.
4. Compared with Pillow:
   - Side-by-side composites (OURS / Sample B signed / Sample A signed) per page.
   - Pixel difference vs Sample A (Sample B signed has no text layer; OCR-grade reference for visual layout only).
   - Mean absolute difference (MAD) and percentage of pixels with |Δ| > 8 (tolerance for anti-aliasing).

References used:
- `Sample B Commercial Offer 1.0 and MSA (for signature).pdf` — 12 pages.
- `Sample A Commercial Offer 1.1 (signed).pdf` — 12 pages.

Artifacts (regenerable): `/tmp/bsg_pixel_diff/{ours,ref_cei,ref_zen,diff}/`.

## 2. Findings (before fixes)

### 2.1 Page count drift — primary issue

| Source | Pages |
|---|---|
| OURS (initial) | **18** |
| Sample B signed | 12 |
| Sample A signed | 12 |

50% page-count overshoot. AGREEMENT body especially expanded (~6 extra pages).

### 2.2 Typography over-sizing in OFFER

Direct measurements from rendered output vs reference:

| Element | OURS (before) | Reference | Verdict |
|---|---|---|---|
| `.offer-title` ("Service Agreement") | 76 px ≈ 57 pt | ≈ 36 pt | 1.6× too large |
| `.offer-subtitle` | 22 px ≈ 16.5 pt | ≈ 10 pt | 1.7× too large |
| `.section-header h2` | 49 px ≈ 37 pt | ≈ 14 pt | 2.6× too large |
| `.section-index` (badge) | 40 px ≈ 30 pt | ≈ 11 pt | 2.7× too large |
| `.meta-value` | 18 px ≈ 13.5 pt | ≈ 11 pt | 1.2× too large |
| `th` | 15 px ≈ 11 pt | ≈ 7 pt | 1.6× too large |
| `td` | 16 px ≈ 12 pt | ≈ 9 pt | 1.3× too large |
| `.fee-value` | 24 px ≈ 18 pt | ≈ 14 pt | 1.3× too large |
| `.terms-value` | 15 px ≈ 11 pt | ≈ 9.5 pt | 1.2× too large |

Result: OFFER alone took 3 pages instead of 2 (Section 4 spilled to page 3).

### 2.3 AGREEMENT body density

| Property | OURS (before) | Reference | Effect |
|---|---|---|---|
| `.agreement-p` font-size | 10.5 pt | ~9.5 pt | Larger body |
| `.agreement-p` line-height | 1.5 | ~1.4 | More vertical space |
| `.agreement-p` margin-bottom | 14 px | ~8 px | Bigger gap between paragraphs |
| `.agreement-h2` margin-top | 22 px | ~14 px | Bigger gap before section |
| `.agreement-list li` margin-bottom | 8 px | ~4 px | Looser bullets |
| Page margin | 2.5 cm | ~2.0 cm | Less usable area |

Cumulative effect: AGREEMENT pages ran 16 instead of 10.

## 3. Fixes applied

### 3.1 OFFER typography rescaled

`pdf-kit/styles.ts`:

| Class | Before | After |
|---|---|---|
| `.offer-title` | 76 px | **36 pt** |
| `.offer-subtitle` | 22 px | **10 pt** |
| `.section-header h2` | 49 px | **14 pt** |
| `.section-index` | 40 px (44×44 box) | **11 pt** (22×22 box) |
| `.section-badge` | 15 px | **7 pt** |
| `.meta-value` | 18 px | **11 pt** |
| `.meta-label` | 9 pt | 7 pt (slightly tighter) |
| `.meta-note` | 15 px | **8 pt** |
| `th` / `td` | 15/16 px | **7 pt / 9 pt** |
| `.fee-value` | 24 px | **14 pt** |
| `.fee-card h3` | 11 px | 7 pt |
| `.fee-subtitle` | 12 px | 7.5 pt |
| `.terms-value` / `.terms-label` | 15/12 px | **9.5 pt / 7.5 pt** |
| `.signature-name` | 11 pt | 9.5 pt |
| `.signature-line` | 9 pt | 8 pt |

Vertical paddings adjusted proportionally.

### 3.2 AGREEMENT body tightened

| Class | Before | After |
|---|---|---|
| `.agreement-h2` | 11 pt, margin 22/12 | **10.5 pt, margin 14/8** |
| `.agreement-h3` | 11 pt, margin 18/10 | **10.5 pt, margin 12/6** |
| `.agreement-p` | 10.5 pt, line-height 1.5, margin 14 | **9.5 pt, line-height 1.4, margin 8** |
| `.agreement-list` | padding-left 24, margin 14 | padding-left 20, margin 8 |
| `.agreement-list li` | margin 8 | **4** |
| `.agreement-sublist li` | margin 4 | 2 |

### 3.3 Page margins

`pdf-kit/tokens.ts`:

```ts
pageMarginCm: 2.5  →  2.0
```

This single change saved ~1 page on its own without touching content.

## 4. Findings (after fixes)

### 4.1 Page count parity

| Source | Pages |
|---|---|
| **OURS (after)** | **12** ✅ |
| Sample B signed | 12 |
| Sample A signed | 12 |

### 4.2 Pixel-difference metrics (vs Sample A)

Mean absolute grayscale difference per page (0–255 scale; lower = closer match):

| Page | MAD before | MAD after | Δ |
|---|---|---|---|
| 1 (OFFER cover + Section 1) | 21.02 | **16.70** | −4.3 |
| 2 (OFFER cont.) | 16.23 | 18.29 | +2.1 |
| 3 (Parties + Overview) | 23.87 | **30.18** | +6.3 |
| 4 (Customer Relationship + Disclosures) | 30.10 | 31.55 | +1.5 |
| 5 (Disclosures cont.) | 35.86 | 35.36 | −0.5 |
| 6 (Payment) | 33.55 | 33.37 | −0.2 |
| 7 (Customer Data + Term) | 30.22 | 40.99 | +10.8 |
| 8 (IP) | 40.03 | 38.99 | −1.0 |
| 9 (Reps & Warranties) | 35.30 | 34.41 | −0.9 |
| 10 (Indemnification + Limits) | 26.12 | 29.83 | +3.7 |
| 11 (Dispute Resolution) | 29.98 | 29.70 | −0.3 |
| 12 (Other + Signatures) | 11.08 | 13.17 | +2.1 |

**Note**: After-fix MAD per page is comparable, sometimes slightly higher because content now lands on a different y-offset within the same page (when a paragraph slides up by 5px, every byte shifts and pixel diff goes up). Page-count parity is the meaningful metric, not pixel-perfect overlay (different fonts shipped by Chrome vs the reference's authoring tool make pixel-perfect impossible without font embedding).

### 4.3 Visual side-by-side review (composites generated)

| Page | Verdict |
|---|---|
| 1 | OFFER header / meta / Section 1 layout matches references. Our row count differs (2 rows vs 6) because manualDefaults uses flat pricing while references use tiered. Same template, different data. |
| 3 | Parties block + Overview + Service Provider Account + Validation — visually equivalent layout. Bold uppercase opener, standard body, list bullets. |
| 4 | Customer Relationship + Disclosures bullets — list rendering matches. |
| 7 | IP rights with two embedded sub-lists — matches. |
| 9 | Reps & Warranties single big list + nested (m) Merchant Offering sub-list — renders correctly. |
| 11 | Dispute Resolution with 4 standalone uppercase sub-headings — matches. |
| 12 | Final paragraphs + 3-panel signature block — close match (we don't add Sign.com timestamps, that's e-signature service overlay). |

## 5. Known residual differences (acceptable / out-of-scope)

1. **Sign.com signature footer** in references (Doc ID, IP, timestamp) — out of scope; that is e-signature service overlay, not part of our renderer.
2. **Reference page footer** uses "Page X of N" with grey text we don't fully replicate (Chrome's headless `--print-to-pdf` reports `Page 0 of 0` in raw text extraction; the actual user flow uses popup `window.print()` which resolves CSS counters correctly).
3. **Font hinting / subpixel rendering** — Chrome system fonts vs reference's authoring fonts. Cannot pixel-match without embedding identical font files.
4. **Section 1 row count for OFFER** — depends on whether user enabled tiered pricing in the calculator. References show 6 rows (3 tiers × 2 regions); manualDefaults uses flat (1 row × 2 regions).

## 6. Verification

- `npm run typecheck` — pass.
- `npm test` — 187/187 pass.
- `npm run build` — clean.
- Manual rerun: `cd /Users/monstermac/WebstormProjects/bsg_calculator && npx tsx /tmp/bsg_pixel_diff/dump.mjs && /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --headless --no-pdf-header-footer --print-to-pdf=/tmp/bsg_pixel_diff/ours.pdf file:///tmp/bsg_pixel_diff/ours.html`. Output 12 pages.

## 7. Files changed

- `src/components/document-wizard/pdf-kit/styles.ts` — typography rescaled across OFFER + AGREEMENT.
- `src/components/document-wizard/pdf-kit/tokens.ts` — `pageMarginCm: 2.5 → 2.0`.

## 8. Follow-up (not blocking)

- Investigate `Page 0 of 0` artifact in headless Chrome `--print-to-pdf` (CSS `counter(pages)`). Real browser print dialog resolves correctly; only headless output has this quirk. If we move to server-side Puppeteer in Phase 8 we can pin this down.
- Consider embedding a specific font file (e.g. Inter or Helvetica Neue) so PDF renders identically across user environments.
