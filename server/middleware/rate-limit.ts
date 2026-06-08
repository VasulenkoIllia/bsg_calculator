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
import { isTest } from "../config/env";
import { RateLimitedError } from "../shared/errors";

const ONE_MINUTE_MS = 60_000;

/**
 * In the test environment we bypass every rate limiter — integration
 * tests hit endpoints from the same localhost IP many times in a few
 * milliseconds and would otherwise trip the limiter (e.g. login at
 * 5/min). Rate-limit semantics are already covered by a dedicated
 * dev smoke test (verified manually); they don't need to fire on
 * every other test.
 */
function passThrough(_req: Request, _res: Response, next: NextFunction) {
  next();
}

function buildLimiter(options: Partial<Options> & { max: number; message: string }) {
  if (isTest) return passThrough;
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

/**
 * Sprint 9.V audit fix — separate limiter for authenticated
 * self-service actions (/me/password + /me/sign-out-everywhere).
 *
 * Why separate from `loginLimiter`: both /me endpoints are
 * Bearer-authenticated and shouldn't share an IP counter with the
 * unauthenticated /login surface. A burst of /me/password attempts
 * from an operator would otherwise eat into the same 5/min budget
 * and temporarily block /login from the same IP for a legit user.
 *
 * The 5/min cap matches /login's posture because /me/password also
 * does a bcrypt compare (currentPassword verification), so the DoS
 * profile is the same — just keyed to a different counter pool.
 */
export const selfServiceLimiter = buildLimiter({
  max: 5,
  message: "Too many requests. Please wait a minute and try again."
});

/**
 * Phase 8 Stage 2 — 2FA limiters.
 *
 * `twoFactorVerifyLimiter` (10/min/IP) caps the login second-step: a
 * 6-digit TOTP has 1M combinations, so 10/min keeps brute force
 * infeasible within a code's 30s validity window. `twoFactorSetupLimiter`
 * (3/min/IP) throttles the QR-generation / confirm endpoints (a user
 * enrols once).
 */
export const twoFactorVerifyLimiter = buildLimiter({
  max: 10,
  message: "Too many 2FA attempts. Please wait a minute and try again."
});

export const twoFactorSetupLimiter = buildLimiter({
  max: 3,
  message: "Too many 2FA setup requests. Please wait a minute and try again."
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

/**
 * HubSpot proxy limiter for endpoints that hit the upstream HubSpot
 * API (with caching). Tighter than the general apiLimiter because
 * a cache miss + a misbehaving client could otherwise exhaust the
 * HubSpot rate-limit budget (100 req / 10s on a Private App).
 *
 * Applied to /api/v1/hubspot/pipelines + future
 * /api/v1/hubspot/refresh.
 */
export const hubspotProxyLimiter = buildLimiter({
  max: 10,
  message: "Too many HubSpot proxy requests. Slow down."
});

/**
 * PDF preview limiter — Sprint 6.F.1 audit fix (HIGH).
 *
 * `POST /api/v1/pdf/preview` runs Puppeteer.setContent + page.pdf()
 * against a single shared browser process. The global apiLimiter
 * (60/min/IP) is too loose: an authenticated user pumping 60 renders
 * per minute will keep the browser tab pipeline saturated and starve
 * the saved-document download path (which uses the SAME pool). A
 * single misbehaving account therefore degrades PDF generation for
 * every other operator.
 *
 * 10/min/IP is sized for the realistic interactive use case (an
 * operator iterating on the wizard preview before saving). Real
 * pricing reviews rarely fire more than a few previews per minute;
 * the cap leaves comfortable headroom while bounding the worst case.
 */
export const pdfPreviewLimiter = buildLimiter({
  max: 10,
  message: "Too many PDF preview requests. Wait a moment and try again."
});

/**
 * Sprint 6.9 N4 — listing limiter for endpoints that accept the
 * Sprint 6.8 `?sort=` parameter. `LOWER()` ORDER BY without a
 * functional index used to filesort on every page; the indexes
 * shipped in 0006 migrate the LOWER variant for the affected
 * columns, but a malicious caller could still walk every cursor at
 * 60 req/min, hitting the JOIN'd listing repeatedly.
 *
 * 30/min/IP leaves headroom for legitimate Load-more clicks (one
 * page every ~2 seconds is generous) while halving the worst-case
 * cost vs the global apiLimiter.
 */
export const listingLimiter = buildLimiter({
  max: 30,
  message: "Too many list requests. Wait a moment and try again."
});
