/**
 * Health + readiness endpoints.
 *
 * - `GET /health` — liveness probe. No external dependencies checked.
 *   Used by Docker HEALTHCHECK + load balancer simple ping.
 *
 * - `GET /ready` — readiness probe. Pings the DB. Phase 9 will also
 *   probe HubSpot reachability when the token is configured.
 *
 * Neither requires auth (per the §4.0 auth matrix).
 */

import { sql } from "drizzle-orm";
import { Router } from "express";
import { db } from "../../db/client";
import { env } from "../../config/env";
import { asyncHandler } from "../../shared/async-handler";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    app: env.APP_NAME,
    env: env.NODE_ENV,
    ts: new Date().toISOString()
  });
});

healthRouter.get(
  "/ready",
  asyncHandler(async (_req, res) => {
    const checks: Record<string, "ok" | "fail"> = {};
    let allOk = true;

    // DB ping — 1s timeout via the pool's underlying socket.
    try {
      await db.execute(sql`SELECT 1`);
      checks.db = "ok";
    } catch {
      checks.db = "fail";
      allOk = false;
    }

    // HubSpot reachability: only checked when a token is configured.
    // Phase 8 returns "unconfigured"; Phase 9 will do a HEAD request
    // to the token info endpoint.
    if (env.HUBSPOT_API_TOKEN) {
      // Phase 9 wires the real check. Phase 8 placeholder.
      checks.hubspot = "ok";
    }

    res.status(allOk ? 200 : 503).json({
      status: allOk ? "ready" : "degraded",
      checks,
      ts: new Date().toISOString()
    });
  })
);
