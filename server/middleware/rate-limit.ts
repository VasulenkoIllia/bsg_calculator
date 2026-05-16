/**
 * Rate-limit middleware presets.
 *
 * Per `backend_conventions.md` §7:
 *   - POST /auth/login    → 5 / min / IP (credential stuffing defence)
 *   - POST /auth/refresh  → 20 / min / IP (allows multi-tab refresh storms)
 *   - POST /hubspot/webhooks → 200 / min / IP (HubSpot can burst)
 *   - everything else     → 60 / min / IP (general API guard)
 *
 * Backed by `express-rate-limit` v7. In-memory store — single-instance
 * Phase 8 deploy, no Redis needed. When we ever run multiple replicas,
 * swap the store to Redis without changing endpoint code.
 *
 * Rejected requests render via our standard error envelope by
 * throwing `RateLimitedError` from a custom handler, so the response
 * shape matches every other 4xx in the API.
 */

import rateLimit, { type Options } from "express-rate-limit";
import type { NextFunction, Request, Response } from "express";
import { RateLimitedError } from "../shared/errors";

const ONE_MINUTE_MS = 60_000;

function buildLimiter(options: Partial<Options> & { max: number; message: string }) {
  return rateLimit({
    windowMs: ONE_MINUTE_MS,
    standardHeaders: "draft-7",        // RFC 9728 RateLimit-* headers
    legacyHeaders: false,
    // Surface rejection via the standard error envelope.
    handler: (_req: Request, _res: Response, next: NextFunction) => {
      next(new RateLimitedError(options.message));
    },
    ...options
  });
}

/** Login limiter — defends against credential stuffing / brute force. */
export const loginLimiter = buildLimiter({
  max: 5,
  message: "Too many login attempts. Please wait a minute and try again."
});

/** Refresh limiter — generous because legit multi-tab clients burst. */
export const refreshLimiter = buildLimiter({
  max: 20,
  message: "Too many refresh attempts. Please slow down."
});

/** Webhook limiter — HubSpot may burst hundreds of events on bulk edits. */
export const webhookLimiter = buildLimiter({
  max: 200,
  message: "Webhook rate limit exceeded."
});

/** General API limiter — applied across all other /api/v1/* endpoints. */
export const apiLimiter = buildLimiter({
  max: 60,
  message: "Too many requests. Please slow down."
});
