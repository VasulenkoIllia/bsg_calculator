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
import {
  startWebhookProcessor,
  stopWebhookProcessor
} from "./modules/hubspot/webhooks/webhooks.processor";
import { monday } from "./modules/monday/monday.client";
import {
  startMondayWebhookProcessor,
  stopMondayWebhookProcessor
} from "./modules/monday/webhooks/webhooks.processor";
import { shutdownBrowserPool } from "./modules/pdf/browser-pool";
import { bootstrapSuperAdmin } from "./scripts/bootstrap-super-admin";
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

  // Phase 8 Stage 1: promote BOOTSTRAP_SUPER_ADMIN_EMAIL to
  // super_admin if set. Runs once per boot; idempotent + never
  // demotes. Awaited via .catch so an error doesn't block the
  // server listening — bootstrap is best-effort, the operator can
  // re-trigger by restarting once they've created the user.
  bootstrapSuperAdmin().catch(err => {
    logger.error(
      { err: (err as Error).message },
      "[startup] super-admin bootstrap hook threw"
    );
  });

  // Background: if HUBSPOT_AUTO_BACKFILL=true and companies table
  // empty, paginate HubSpot once. /health responds normally during
  // backfill — listings just return empty pages until done.
  // Both background HubSpot loops are gated on the active provider. After
  // the flip the webhook processor would otherwise burn its 5-attempt
  // retry budget against a dead API for every queued event, and the 401
  // circuit-breaker would trip on every batch — pure log noise with no
  // remediation available.
  if (env.CRM_PROVIDER === "hubspot") {
  backendStartupBackfillIfEmpty().catch(err => {
    logger.error({ err: (err as Error).message }, "[startup] auto-backfill hook threw");
  });

  // Sprint 5: kick off the webhook-event processor loop. No-ops in
  // NODE_ENV=test so the test suite can drive the processor by
  // calling processWebhookBatch() directly (no rogue timers).
  startWebhookProcessor();
  } else {
    logger.info(
      { crmProvider: env.CRM_PROVIDER },
      "[startup] HubSpot backfill + webhook processor NOT started — HubSpot is not the active CRM"
    );
  }

  // The monday processor runs whenever monday is the active CRM. It is
  // harmless when no webhooks are registered yet: the queue is simply
  // empty and each tick is one indexed query.
  if (env.CRM_PROVIDER === "monday") {
    // Assert the pinned API version HERE, in the long-running process.
    // It was previously called only by two CLI scripts, while env.ts and
    // both env templates claimed it runs "at boot" — so the guard against
    // monday's silent version DOWNGRADE never actually protected the
    // server. A downgrade changes field shapes, softValidate absorbs the
    // drift with a warn, and the mapper starts writing NULLs while every
    // webhook still reports success.
    void monday
      .assertApiVersion()
      .then(() => startMondayWebhookProcessor())
      .catch(err => {
        logger.error(
          { err: (err as Error).message },
          "[startup] monday API version assertion FAILED — not starting the webhook processor. Fix MONDAY_API_VERSION."
        );
      });
  }
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

  // Stop the webhook poller BEFORE draining the DB pool — otherwise
  // an in-flight batch's query would hit a closed pool and surface a
  // confusing error during shutdown.
  try {
    stopWebhookProcessor();
    stopMondayWebhookProcessor();
  } catch (err) {
    logger.error({ err }, "error stopping webhook processor");
  }

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
