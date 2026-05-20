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
import { hubspot } from "../hubspot/hubspot.client";
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

    // Sprint 7.4 — REAL HubSpot reachability check (was a hardcoded
    // "ok" placeholder before). Hits the pipelines endpoint with a
    // small list call (cheap, cached behind the client's own
    // pipeline cache; we just want a 200 from HubSpot to confirm
    // the token + network path).
    //
    // A 401 here is the most important signal: it means the
    // Private App token was revoked or rotated. Operator must
    // rotate HUBSPOT_API_TOKEN in env and restart.
    if (env.HUBSPOT_API_TOKEN && hubspot.isConfigured()) {
      try {
        await hubspot.listPipelineStages();
        checks.hubspot = "ok";
      } catch {
        checks.hubspot = "fail";
        allOk = false;
      }
    }

    res.status(allOk ? 200 : 503).json({
      status: allOk ? "ready" : "degraded",
      checks,
      ts: new Date().toISOString()
    });
  })
);
