/**
 * Puppeteer browser pool (singleton with recycle policy).
 *
 * Design:
 *   - ONE browser process per Node process, reused across requests.
 *     Page creation (`browser.newPage()`) is cheap; browser launch is
 *     expensive (200-500ms + Chromium memory baseline ~80MB).
 *   - Recycle when EITHER renderCount > PUPPETEER_RENDERS_PER_BROWSER
 *     (default 1000) OR age > PUPPETEER_BROWSER_TTL_MS (default 24h).
 *     This defends against long-running Chromium memory creep.
 *   - In tests we bypass the pool entirely — env.NODE_ENV === "test"
 *     short-circuits `acquire()` to throw, so a test that accidentally
 *     hits this path fails loudly instead of spawning a real Chromium.
 *
 * Lifecycle:
 *   - Lazy launch on first `acquire()` — boot time stays clean.
 *   - `recycleIfNeeded()` checks the counters before EVERY acquire.
 *     If recycle is due, the old browser is asked to close gracefully,
 *     a new one is launched, the counters reset.
 *   - `shutdown()` called from index.ts on SIGTERM/SIGINT so docker
 *     stop doesn't leave a zombie chromium.
 */

import puppeteer, { type Browser } from "puppeteer";
import { env, isTest } from "../../config/env";
import { logger } from "../../middleware/logger";
import { InternalError } from "../../shared/errors";

interface PoolState {
  browser: Browser;
  /** Number of render() calls served by this browser instance. */
  renderCount: number;
  /** Wall-clock time the browser was launched. */
  launchedAt: number;
}

let state: PoolState | null = null;
/**
 * Concurrent acquires would race each other to launch a second
 * browser. The shared promise serialises the launch so all callers
 * end up sharing the same instance.
 */
let launchInFlight: Promise<PoolState> | null = null;

async function launch(): Promise<PoolState> {
  // Puppeteer reads PUPPETEER_EXECUTABLE_PATH from env if set — we
  // forward it explicitly so the typed env loader is the SoT.
  const browser = await puppeteer.launch({
    headless: env.PUPPETEER_HEADLESS,
    executablePath: env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      // `--no-sandbox` is required when running as root in a Docker
      // container without a seccomp-friendly user namespace. Safe
      // because we only render trusted HTML built from our own
      // templates — no third-party scripts execute.
      "--no-sandbox",
      "--disable-setuid-sandbox",
      // Skip extension auto-install / search indexing — saves ~200ms
      // on cold start.
      "--disable-extensions",
      "--disable-default-apps",
      // Tighter memory footprint per page.
      "--disable-dev-shm-usage"
    ]
  });
  logger.info(
    { pid: browser.process()?.pid ?? null },
    "[pdf] Puppeteer browser launched"
  );
  return {
    browser,
    renderCount: 0,
    launchedAt: Date.now()
  };
}

async function recycleIfNeeded(): Promise<void> {
  if (!state) return;
  const ageMs = Date.now() - state.launchedAt;
  const renderHits = state.renderCount;
  const overTtl = ageMs > env.PUPPETEER_BROWSER_TTL_MS;
  const overCount = renderHits >= env.PUPPETEER_RENDERS_PER_BROWSER;
  if (!overTtl && !overCount) return;

  const old = state;
  state = null;
  logger.info(
    { ageMs, renderHits, reason: overTtl ? "ttl" : "max-renders" },
    "[pdf] recycling Puppeteer browser"
  );
  // Don't await close — a hung Chromium shouldn't block the next
  // request. Errors logged but swallowed.
  void old.browser.close().catch(err => {
    logger.warn({ err: (err as Error).message }, "[pdf] error closing old browser");
  });
}

/**
 * Acquire the singleton browser, launching or recycling as needed.
 * Each call increments the render counter; the surrounding service
 * is expected to call this exactly once per render.
 */
export async function acquireBrowser(): Promise<Browser> {
  if (isTest) {
    throw new InternalError(
      "Puppeteer is disabled in tests. Mock the pdf.service.render() instead."
    );
  }

  await recycleIfNeeded();

  if (state) {
    state.renderCount += 1;
    return state.browser;
  }

  if (!launchInFlight) {
    launchInFlight = launch().finally(() => {
      // Cleared inside the .then handler below; finally only nulls
      // the in-flight slot AFTER state is set. Errors propagate to
      // callers AND clear the slot so retry works.
    });
  }
  try {
    state = await launchInFlight;
  } finally {
    launchInFlight = null;
  }
  state.renderCount += 1;
  return state.browser;
}

/**
 * Graceful shutdown — called from server/index.ts's SIGTERM/SIGINT
 * handler. Closes the browser within `gracefulMs` or kills it.
 */
export async function shutdownBrowserPool(gracefulMs = 5_000): Promise<void> {
  if (!state) return;
  const old = state;
  state = null;
  const timeout = new Promise<void>(resolve =>
    setTimeout(() => resolve(), gracefulMs)
  );
  try {
    await Promise.race([old.browser.close(), timeout]);
  } catch (err) {
    logger.warn(
      { err: (err as Error).message },
      "[pdf] shutdown: error closing browser"
    );
  }
}
