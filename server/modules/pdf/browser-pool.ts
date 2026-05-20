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
  //
  // Sprint 7.3.E — sandbox model:
  //   - The Dockerfile installs `chromium-sandbox` (setuid helper)
  //     and runs the container as the non-root `node` user. Under
  //     that setup Chromium can engage its built-in sandbox, so
  //     `--no-sandbox` is NOT required.
  //   - The previous flags (`--no-sandbox`, `--disable-setuid-sandbox`)
  //     were a workaround for running as root in containers without
  //     userns mapping. They opened a meaningful XSS-to-RCE
  //     amplifier — flagged by the deployment security audit.
  //   - In dev (running outside a container as your laptop user)
  //     Chromium's sandbox falls back gracefully — you may see a
  //     warning in the console; it's expected.
  //
  // `--disable-dev-shm-usage` stays because /dev/shm in Docker is
  // tmpfs-capped at 64MB by default and Chromium hits the limit on
  // larger PDF renders.
  //
  // Sprint 7.4 — PUPPETEER_NO_SANDBOX escape hatch:
  //   If the host kernel lacks userns remapping (e.g. default
  //   Coolify install) the setuid sandbox can't engage and
  //   Chromium refuses to launch. Operator can opt out via
  //   PUPPETEER_NO_SANDBOX=true to revert to the pre-7.3.E
  //   --no-sandbox flags. We log this loudly so the security
  //   posture downgrade is observable.
  const args = [
    "--disable-extensions",
    "--disable-default-apps",
    "--disable-dev-shm-usage"
  ];
  if (env.PUPPETEER_NO_SANDBOX) {
    args.unshift("--no-sandbox", "--disable-setuid-sandbox");
    logger.warn(
      "[pdf] PUPPETEER_NO_SANDBOX=true — Chromium running WITHOUT sandbox. Acceptable for trusted-template renders; review before any user-input HTML path lands."
    );
  }
  const browser = await puppeteer.launch({
    headless: env.PUPPETEER_HEADLESS,
    executablePath: env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args
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
    launchInFlight = launch();
  }
  try {
    state = await launchInFlight;
  } finally {
    // Whether the launch succeeded or threw, the in-flight slot is
    // released. On success, `state` is set; subsequent acquires
    // short-circuit at the top. On failure, the next acquire will
    // try `launch()` again — auto-retry without manual reset.
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
