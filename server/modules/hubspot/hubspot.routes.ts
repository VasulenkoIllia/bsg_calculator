/**
 * HubSpot support endpoints — mounted at /api/v1/hubspot.
 *
 * Sprint 2.7: GET /pipelines (cached, Bearer-auth).
 * Sprint 5  : POST /webhooks (signature-auth) + POST /refresh (Bearer-auth)
 *             — mounted via hubspotWebhooksRouter, which carries its own
 *             auth strategy per route (webhook is public-but-HMAC-signed,
 *             refresh is Bearer).
 *
 * NOTE: requireAuth() is applied selectively (NOT a `router.use`) so
 * the public webhook receiver remains reachable. Each route opts in
 * to its own authentication.
 */

import { Router } from "express";
import { hubspotProxyLimiter } from "../../middleware/rate-limit";
import { requireAuth } from "../../middleware/require-auth";
import { asyncHandler } from "../../shared/async-handler";
import { getPipelines } from "./hubspot.service";
import { hubspotWebhooksRouter } from "./webhooks/webhooks.routes";

export const hubspotRouter = Router();

// Sprint 5: webhooks + manual refresh routes (each handles its own auth).
// Mounted FIRST so the public webhook path is matched before any other
// catch-alls would short-circuit it.
hubspotRouter.use(hubspotWebhooksRouter);

// hubspotProxyLimiter caps at 10/min/IP — proportionate given each
// cache miss costs one HubSpot API call.
hubspotRouter.get(
  "/pipelines",
  requireAuth(),
  hubspotProxyLimiter,
  asyncHandler(async (_req, res) => {
    const data = await getPipelines();
    res.status(200).json(data);
  })
);
