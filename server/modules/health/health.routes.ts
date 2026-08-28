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
import { monday } from "../monday/monday.client";
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
    // Only probe the CRM we actually use. Without the provider check
    // /ready would report 503 forever once HubSpot is switched off, even
    // though the app is perfectly healthy on monday.
    if (
      env.CRM_PROVIDER === "hubspot" &&
      env.HUBSPOT_API_TOKEN &&
      hubspot.isConfigured()
    ) {
      try {
        await hubspot.listPipelineStages();
        checks.hubspot = "ok";
      } catch {
        checks.hubspot = "fail";
        allOk = false;
      }
    }

    // Mirror branch for monday. Without it the provider gate above meant
    // that after the flip /ready probed NO crm at all: a revoked personal
    // token would break every note write and every webhook while the probe
    // happily reported "ready", and the first symptom would be an operator
    // noticing a missing update on a card.
    if (env.CRM_PROVIDER === "monday" && monday.isConfigured()) {
      try {
        // maxRetries 0 — a readiness probe must not stall for 8s on the
        // rate-limit backoff.
        await monday.query(`query { me { id } }`, { label: "ready", maxRetries: 0 });
        checks.monday = "ok";
      } catch {
        checks.monday = "fail";
        allOk = false;
      }
    }

    // Webhook queue health — REPORTED, never used to fail readiness.
    //
    // The dangerous monday failure is silence: a webhook deleted on a
    // board, or events burning their five retries, and nothing anywhere
    // says so. An empty queue is indistinguishable from a quiet CRM, so
    // these numbers are the only way to tell the two apart from outside.
    //
    // Deliberately NOT part of `allOk`: a backlog means data is late, not
    // that the app should be pulled out of service. Making it fail
    // readiness would take the whole site down over a stale company name.
    let queue: Record<string, number | string | null> | undefined;
    if (env.CRM_PROVIDER === "monday") {
      try {
        const q = await db.execute<{
          pending: number;
          failed: number;
          oldest_pending_age_s: number | null;
          last_processed_age_s: number | null;
        }>(sql`
          SELECT
            count(*) FILTER (WHERE status = 'pending')::int AS pending,
            count(*) FILTER (WHERE status = 'failed')::int  AS failed,
            EXTRACT(EPOCH FROM now() - min(received_at) FILTER (WHERE status = 'pending'))::int
              AS oldest_pending_age_s,
            EXTRACT(EPOCH FROM now() - max(processed_at))::int AS last_processed_age_s
          FROM monday_webhook_events
        `);
        const r = q.rows[0];
        queue = {
          pending: Number(r?.pending ?? 0),
          failed: Number(r?.failed ?? 0),
          oldestPendingAgeSeconds: r?.oldest_pending_age_s ?? null,
          lastProcessedAgeSeconds: r?.last_processed_age_s ?? null
        };
      } catch (err) {
        queue = { error: (err as Error).message.slice(0, 120) };
      }
    }

    res.status(allOk ? 200 : 503).json({
      status: allOk ? "ready" : "degraded",
      checks,
      ...(queue ? { mondayWebhookQueue: queue } : {}),
      ts: new Date().toISOString()
    });
  })
);
