/**
 * HubSpot webhook routes.
 *
 * Two routes mounted under /api/v1/hubspot:
 *
 *   POST /webhooks  — public (signature-authenticated, NOT auth-token).
 *                     Raw body parser is mounted globally in app.ts at
 *                     this exact path BEFORE express.json() so the
 *                     signature middleware sees the original bytes.
 *                     This router only chains:
 *                       1. verifyHubspotSignature → HMAC check + JSON parse
 *                       2. webhookLimiter        → 200 req/min/IP
 *                       3. webhookReceiverController → DB insert + 200
 *
 *   POST /refresh   — operator-facing, requires Bearer access token.
 *                     Standard JSON parser already applied by app.ts.
 *                     hubspotProxyLimiter (10 req/min/IP) defends the
 *                     upstream HubSpot per-10s budget — refresh hits
 *                     HubSpot's /companies/{id} endpoint for every id.
 */

import { Router } from "express";
import { hubspotProxyLimiter, webhookLimiter } from "../../../middleware/rate-limit";
import { requireAuth } from "../../../middleware/require-auth";
import { verifyHubspotSignature } from "../../../middleware/verify-hubspot-signature";
import { asyncHandler } from "../../../shared/async-handler";
import { refreshController, webhookReceiverController } from "./webhooks.controller";

export const hubspotWebhooksRouter = Router();

// POST /webhooks — HubSpot → us. NO requireAuth (HubSpot can't carry a
// Bearer); the HMAC v3 signature is the authentication.
hubspotWebhooksRouter.post(
  "/webhooks",
  verifyHubspotSignature(),
  webhookLimiter,
  asyncHandler(webhookReceiverController)
);

// POST /refresh — operator triggers a manual resync of N companies.
// Bearer-auth required (same as every other /api/v1 endpoint).
// hubspotProxyLimiter: refresh fans out into HubSpot API calls; one
// per id. 10 req/min × max 100 ids per request = upper bound 1000 ids
// per minute per IP, which is well inside the per-10s budget.
hubspotWebhooksRouter.post(
  "/refresh",
  requireAuth(),
  hubspotProxyLimiter,
  asyncHandler(refreshController)
);
