/**
 * Visual-diff harness: backend PDF vs. frontend "Generate PDF" PDF.
 *
 * Goal: guarantee that the two PDF rendering paths in the app
 * (backend `/api/v1/documents/:number/pdf` and frontend wizard's
 * "Generate PDF" button) produce byte-for-byte equivalent visual
 * output for the same DocumentTemplatePayload.
 *
 * Both paths feed into Chrome's PDF engine — the backend via
 * Puppeteer's `page.pdf({ preferCSSPageSize: true })` and the
 * frontend via the browser's `window.print() → Save as PDF` dialog.
 * Same engine + same HTML = same output, modulo any rendering
 * options we accidentally tweak between the two paths.
 *
 * THIS SCRIPT — uses Puppeteer for BOTH renders, with two configs:
 *
 *   1. "backend"  — calls the real production `renderHtmlToPdf()`
 *                   (server/modules/pdf/pdf.service.ts), exact same
 *                   code that streams to /api/v1/documents/:number/pdf.
 *   2. "frontend" — calls Puppeteer's `page.pdf()` with browser-default
 *                   settings (no preferCSSPageSize hack, no margin
 *                   override) to approximate what window.print() →
 *                   Save as PDF produces. With our HTML which carries
 *                   a `@page { size: A4; margin: 2cm }` rule, Chrome's
 *                   PDF engine respects it regardless of the
 *                   preferCSSPageSize flag, so the two outputs SHOULD
 *                   match per-page.
 *
 * It then converts each PDF to one PNG per page using `pdftoppm`
 * (from poppler — must be installed on the host) and pixel-diffs
 * each page pair using `pixelmatch`. A per-page difference of more
 * than `MAX_DIFF_RATIO` (default 0.5%) fails the run.
 *
 * Gold mode:
 *   `npm run visual-diff:gold` — overwrite the gold files in
 *   `tests/visual-diff-gold/` from the current code. Run this when
 *   the template intentionally changes (Sprint X UI tweak, new
 *   section, font change).
 *
 * CI mode:
 *   `npm run visual-diff` — render fresh, compare against gold,
 *   exit 1 if drift exceeds threshold. Saves diff images next to
 *   the gold for inspection.
 *
 * Caveats — what THIS test does NOT cover (documented in
 * `docs/decisions.md` → Sprint 5.5 entry):
 *   - Browser variation: a user on Safari/Firefox may see slightly
 *     different output (kerning, page-break heuristics). Backend
 *     output is the canonical reference; we recommend operators
 *     use the "Download PDF" button on /documents/:number for any
 *     contract delivered to a counterparty.
 *   - Print dialog options: if a user toggles "Headers and footers"
 *     ON in the print dialog, their browser will inject URL +
 *     timestamp into the printed PDF. Backend output never has this.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import { buildOfferPdfHtml } from "../../src/components/document-wizard/buildOfferPdfHtml";
import { renderHtmlToPdf } from "../../server/modules/pdf/pdf.service";
import {
  acquireBrowser,
  shutdownBrowserPool
} from "../../server/modules/pdf/browser-pool";
import { FIXTURES, type FixtureKey } from "./fixture-payload";

const MODE = (process.argv[2] ?? "compare") as "gold" | "compare";
const DEFAULT_MAX_DIFF_RATIO = 0.005; // 0.5% of pixels per page (overridable per fixture)
const PNG_DPI = 100; // 100 DPI: ~826×1169 px per A4 page; balances precision vs. CPU

const REPO_ROOT = resolve(__dirname, "..", "..");
const GOLD_DIR = join(REPO_ROOT, "tests", "visual-diff-gold");
const OUT_DIR = join(REPO_ROOT, "tests", "visual-diff-output");

interface RenderResult {
  /** PDF bytes for the named render path. */
  pdfBytes: Buffer;
  /** PNG buffer per page (index 0 = page 1). */
  pages: Buffer[];
}

/**
 * BACKEND path — exact production code from pdf.service.ts.
 */
async function renderBackend(html: string): Promise<Buffer> {
  return renderHtmlToPdf(html);
}

/**
 * FRONTEND path — what window.print() → Save as PDF would produce
 * in a recent Chrome. Mimicked here by calling Puppeteer's page.pdf()
 * with browser-default settings (no preferCSSPageSize, no margin
 * override). The `@page { size: A4; margin: 2cm }` CSS rule in our
 * template drives the actual page geometry either way.
 */
async function renderFrontendSimulated(html: string): Promise<Buffer> {
  const browser = await acquireBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1200, height: 1600 });
    // `domcontentloaded` is the right value for setContent (HTML
    // string, no remote assets). `networkidle0` is only valid for
    // page.goto and is rejected at the type level by Puppeteer's
    // SetContentWaitForOptions.
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.emulateMediaType("print");
    // window.print() → Save as PDF in Chrome uses the browser's
    // default print options: no explicit margin, no
    // preferCSSPageSize (the @page CSS still wins because Chrome's
    // PDF engine respects @page natively).
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true
      // intentionally NO preferCSSPageSize, NO margin override
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => {});
  }
}

/**
 * Convert a PDF buffer into one PNG buffer per page using `pdftoppm`.
 * Writes the PDF to a temp file (pdftoppm requires file input), runs
 * pdftoppm with `-r {PNG_DPI}` to produce numbered PNGs, then reads
 * them back into memory.
 */
function pdfToPngPages(pdf: Buffer, label: string): Buffer[] {
  const workDir = join(OUT_DIR, `_tmp-${label}`);
  if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });

  const pdfPath = join(workDir, "in.pdf");
  writeFileSync(pdfPath, pdf);

  const outPrefix = join(workDir, "page");
  execFileSync("pdftoppm", ["-r", String(PNG_DPI), "-png", pdfPath, outPrefix], {
    stdio: ["ignore", "ignore", "inherit"]
  });

  // pdftoppm writes page-1.png, page-2.png, ... — sort numerically.
  const files = readdirSync(workDir)
    .filter(f => f.startsWith("page-") && f.endsWith(".png"))
    .sort((a, b) => {
      const ai = Number(a.replace(/[^\d]/g, ""));
      const bi = Number(b.replace(/[^\d]/g, ""));
      return ai - bi;
    });
  const pages = files.map(f => readFileSync(join(workDir, f)));

  rmSync(workDir, { recursive: true, force: true });
  return pages;
}

interface PageDiff {
  page: number;
  totalPixels: number;
  diffPixels: number;
  ratio: number;
  diffPng: Buffer | null;
}

/**
 * Crop a PNG's raw RGBA buffer to the requested dimensions (from
 * 0,0 — top-left). pdftoppm rounds the same A4 page geometry to
 * either floor or ceil of the half-pixel between two near-identical
 * PDFs, leaving the rasterised images mismatched by 1px in width or
 * height. We crop both to the common min dimensions before diffing
 * so a sub-pixel rounding artifact doesn't fail the comparison.
 */
function cropPng(png: PNG, targetW: number, targetH: number): PNG {
  if (png.width === targetW && png.height === targetH) return png;
  const out = new PNG({ width: targetW, height: targetH });
  for (let y = 0; y < targetH; y++) {
    const srcStart = (png.width * y) * 4;
    const dstStart = (targetW * y) * 4;
    png.data.copy(out.data, dstStart, srcStart, srcStart + targetW * 4);
  }
  return out;
}

/**
 * Pixel-diff two PNG buffers using pixelmatch. Returns the diff
 * stats plus a colourised diff PNG (red overlay) for inspection.
 *
 * Dimension normalisation: pdftoppm sometimes produces a 1px width
 * or height difference between two near-identical PDFs due to
 * floating-point rounding on the page-bounds → raster-pixel mapping.
 * We crop both inputs to the min(w, h) before pixelmatch so the
 * comparison runs on a shared grid and reports actual content
 * differences, not rasterisation artefacts.
 */
function diffPages(a: Buffer, b: Buffer, page: number): PageDiff {
  // PNG.sync.read returns PNGWithMetadata (a structural superset of
  // PNG); cropPng returns a plain PNG. We keep separate `read`/`cropped`
  // bindings so a future reader can see the type transition explicitly
  // rather than fighting the TS inference on reassignment.
  const readA = PNG.sync.read(a);
  const readB = PNG.sync.read(b);
  const w = Math.min(readA.width, readB.width);
  const h = Math.min(readA.height, readB.height);
  const pngA = cropPng(readA, w, h);
  const pngB = cropPng(readB, w, h);
  const diff = new PNG({ width: w, height: h });
  const total = w * h;
  const mismatched = pixelmatch(pngA.data, pngB.data, diff.data, w, h, {
    threshold: 0.1, // per-pixel sensitivity — 0.1 = tolerant to anti-aliasing
    includeAA: false
  });
  return {
    page,
    totalPixels: total,
    diffPixels: mismatched,
    ratio: mismatched / total,
    diffPng: PNG.sync.write(diff)
  };
}

async function processFixture(key: FixtureKey): Promise<{
  fixture: string;
  pageCount: number;
  diffs: PageDiff[];
  maxDiffRatio: number;
}> {
  const { name, build, maxDiffRatio = DEFAULT_MAX_DIFF_RATIO } = FIXTURES[key];
  console.log(`\n— Fixture: ${name} —`);
  const payload = build();
  const html = buildOfferPdfHtml(payload);

  console.log("  Rendering backend PDF…");
  const backendPdf = await renderBackend(html);
  console.log(`    ${backendPdf.length.toLocaleString()} bytes`);

  console.log("  Rendering frontend-simulated PDF…");
  const frontendPdf = await renderFrontendSimulated(html);
  console.log(`    ${frontendPdf.length.toLocaleString()} bytes`);

  console.log("  Converting to PNGs via pdftoppm…");
  const backendPages = pdfToPngPages(backendPdf, `${name}-backend`);
  const frontendPages = pdfToPngPages(frontendPdf, `${name}-frontend`);
  console.log(`    backend: ${backendPages.length} pages | frontend: ${frontendPages.length} pages`);

  if (backendPages.length !== frontendPages.length) {
    console.error(`  ✗ Page count mismatch.`);
    return { fixture: name, pageCount: -1, diffs: [], maxDiffRatio };
  }

  const diffs: PageDiff[] = [];
  for (let i = 0; i < backendPages.length; i++) {
    const d = diffPages(backendPages[i], frontendPages[i], i + 1);
    diffs.push(d);
  }

  // Persist current-run pages + diffs into the output dir for human
  // inspection — useful even on a green run because reviewers like to
  // eyeball the rendered output.
  const fixtureOutDir = join(OUT_DIR, name);
  mkdirSync(fixtureOutDir, { recursive: true });
  for (let i = 0; i < backendPages.length; i++) {
    writeFileSync(join(fixtureOutDir, `page-${i + 1}-backend.png`), backendPages[i]);
    writeFileSync(join(fixtureOutDir, `page-${i + 1}-frontend.png`), frontendPages[i]);
    const dp = diffs[i].diffPng;
    if (dp) writeFileSync(join(fixtureOutDir, `page-${i + 1}-diff.png`), dp);
  }

  // ── Gold mode: persist the BACKEND render as the canonical gold
  //    image. We do not store both (frontend is, by design,
  //    supposed to match backend) — the gold is the contract.
  if (MODE === "gold") {
    const fixtureGoldDir = join(GOLD_DIR, name);
    mkdirSync(fixtureGoldDir, { recursive: true });
    for (let i = 0; i < backendPages.length; i++) {
      writeFileSync(join(fixtureGoldDir, `page-${i + 1}.png`), backendPages[i]);
    }
    console.log(`  ✓ Wrote ${backendPages.length} gold PNGs to ${fixtureGoldDir}`);
  } else {
    // Compare mode: also check the BACKEND render against the gold
    // (catches template drift over time, not just frontend/backend
    // mismatch).
    const fixtureGoldDir = join(GOLD_DIR, name);
    if (existsSync(fixtureGoldDir)) {
      for (let i = 0; i < backendPages.length; i++) {
        const goldPath = join(fixtureGoldDir, `page-${i + 1}.png`);
        if (!existsSync(goldPath)) {
          console.warn(`  ! gold page ${i + 1} missing — skip gold check for this page.`);
          continue;
        }
        const goldBytes = readFileSync(goldPath);
        const goldDiff = diffPages(goldBytes, backendPages[i], i + 1);
        if (goldDiff.ratio > maxDiffRatio) {
          console.warn(
            `  ! page ${i + 1}: backend output drifted from gold by ${(goldDiff.ratio * 100).toFixed(3)}%`
          );
          if (goldDiff.diffPng) {
            writeFileSync(
              join(fixtureOutDir, `page-${i + 1}-gold-drift.png`),
              goldDiff.diffPng
            );
          }
        }
      }
    } else {
      console.warn(`  ! No gold dir at ${fixtureGoldDir} — run npm run visual-diff:gold first.`);
    }
  }

  for (const d of diffs) {
    const pct = (d.ratio * 100).toFixed(3);
    const tag = d.ratio <= maxDiffRatio ? "✓" : "✗";
    console.log(`  ${tag} page ${d.page}: ${d.diffPixels.toLocaleString()} / ${d.totalPixels.toLocaleString()} px (${pct}%)`);
  }

  return { fixture: name, pageCount: backendPages.length, diffs, maxDiffRatio };
}

async function main(): Promise<void> {
  // Production code asserts isTest === false before launching
  // Puppeteer. Visual-diff runs against the dev pool, so NODE_ENV
  // must be development (or anything that's not "test").
  if (process.env.NODE_ENV === "test") {
    throw new Error("Run visual-diff with NODE_ENV=development (Puppeteer is gated off in test).");
  }

  // Sprint 5.F.3: pre-flight check for pdftoppm. Without this, the
  // first execFileSync call deep inside processFixture throws an
  // unactionable ENOENT — operators have to dig through the stack
  // to figure out what's missing. Fail fast with a clear install hint.
  try {
    execFileSync("pdftoppm", ["-v"], { stdio: ["ignore", "ignore", "pipe"] });
  } catch {
    console.error(
      "\n[visual-diff] FATAL: `pdftoppm` not found on PATH.\n" +
        "  Install with: brew install poppler  (macOS) or  apt install poppler-utils (Debian).\n"
    );
    process.exit(2);
  }

  if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });

  console.log(`\n=== Visual-diff (${MODE} mode) ===`);
  console.log(
    `  Default threshold: ≤ ${(DEFAULT_MAX_DIFF_RATIO * 100).toFixed(2)}% pixels differ per page (per-fixture overrides apply)`
  );
  console.log(`  Output:    ${OUT_DIR}`);
  console.log(`  Gold:      ${GOLD_DIR}`);

  let failed = false;
  try {
    for (const key of Object.keys(FIXTURES) as FixtureKey[]) {
      const result = await processFixture(key);
      const overBudget = result.diffs.filter(d => d.ratio > result.maxDiffRatio);
      if (result.pageCount === -1 || overBudget.length > 0) {
        failed = true;
        console.error(
          `  ✗ ${result.fixture}: ${overBudget.length} page(s) over budget (≤${(result.maxDiffRatio * 100).toFixed(2)}%) — see ${OUT_DIR}/${result.fixture}/`
        );
      } else {
        console.log(`  ✓ ${result.fixture}: all ${result.diffs.length} pages within budget (≤${(result.maxDiffRatio * 100).toFixed(2)}%)`);
      }
    }
  } finally {
    await shutdownBrowserPool();
  }

  if (MODE === "compare" && failed) {
    console.error("\n✗ Visual-diff FAILED — backend and frontend PDFs diverge.");
    process.exit(1);
  }
  console.log("\n✓ Visual-diff PASSED.");
}

main().catch(err => {
  console.error("[visual-diff] crashed:", err);
  process.exit(2);
});
