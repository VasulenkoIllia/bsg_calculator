/**
 * Process entrypoint.
 *
 * - Binds Express to PORT.
 * - Logs lifecycle (boot, shutdown signals).
 * - Wires graceful shutdown so in-flight requests finish.
 *
 * Run via:
 *   npm run dev:server         # tsx watch (development)
 *   npm start                  # tsx (production-like locally)
 *   node --loader tsx server/index.ts  # docker entrypoint
 */

import { createApp } from "./app";
import { env, isProd } from "./config/env";
import { pool } from "./db/client";
import { logger } from "./middleware/logger";
import { shutdownBrowserPool } from "./modules/pdf/browser-pool";
import { backendStartupBackfillIfEmpty } from "./scripts/hubspot-backfill";

const app = createApp();

const server = app.listen(env.PORT, () => {
  logger.info(
    {
      port: env.PORT,
      env: env.NODE_ENV,
      url: isProd ? `https://${env.APP_DOMAIN}` : `http://localhost:${env.PORT}`
    },
    `[${env.APP_NAME}] API listening`
  );

  // Background: if HUBSPOT_AUTO_BACKFILL=true and companies table
  // empty, paginate HubSpot once. /health responds normally during
  // backfill — listings just return empty pages until done.
  backendStartupBackfillIfEmpty().catch(err => {
    logger.error({ err: (err as Error).message }, "[startup] auto-backfill hook threw");
  });
});

// ─── Graceful shutdown ────────────────────────────────────────────
// SIGTERM is sent by docker stop; SIGINT by ctrl-C. We give in-flight
// requests up to 10s to complete, then force-exit. Postgres pool is
// drained after the HTTP server stops accepting new connections.
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "shutdown initiated");

  const forceExitTimer = setTimeout(() => {
    logger.warn("shutdown timed out after 10s, forcing exit");
    process.exit(1);
  }, 10_000);
  forceExitTimer.unref();

  // Stop accepting new HTTP connections; in-flight finish.
  await new Promise<void>(resolve => {
    server.close(err => {
      if (err) logger.error({ err }, "error closing HTTP server");
      resolve();
    });
  });

  // Close the Puppeteer browser (if any was launched).
  try {
    await shutdownBrowserPool();
  } catch (err) {
    logger.error({ err }, "error closing Puppeteer browser");
  }

  // Drain DB pool.
  try {
    await pool.end();
  } catch (err) {
    logger.error({ err }, "error closing DB pool");
  }

  logger.info("shutdown complete");
  clearTimeout(forceExitTimer);
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

// Top-level unhandled rejections — log and let the process die.
// We intentionally don't swallow: a fresh container is healthier
// than a process in an unknown state.
process.on("unhandledRejection", reason => {
  logger.fatal({ reason }, "unhandled rejection");
  process.exit(1);
});
process.on("uncaughtException", err => {
  logger.fatal({ err }, "uncaught exception");
  process.exit(1);
});
