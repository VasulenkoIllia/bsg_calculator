/**
 * HubSpot read-only support endpoints — mounted at /api/v1/hubspot.
 *
 * Sprint 2.7: GET /pipelines (cached). Future:
 *   - POST /webhooks (Sprint 5)
 *   - POST /refresh  (Sprint 5)
 *
 * All endpoints require Bearer access token (HubSpot data is
 * already implicitly cached locally; this endpoint only proxies
 * config metadata).
 */

import { Router } from "express";
import { hubspotProxyLimiter } from "../../middleware/rate-limit";
import { requireAuth } from "../../middleware/require-auth";
import { asyncHandler } from "../../shared/async-handler";
import { getPipelines } from "./hubspot.service";

export const hubspotRouter = Router();

hubspotRouter.use(requireAuth());

// hubspotProxyLimiter caps at 10/min/IP — proportionate given each
// cache miss costs one HubSpot API call.
hubspotRouter.get(
  "/pipelines",
  hubspotProxyLimiter,
  asyncHandler(async (_req, res) => {
    const data = await getPipelines();
    res.status(200).json(data);
  })
);
