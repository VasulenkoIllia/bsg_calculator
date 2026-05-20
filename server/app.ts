/**
 * Express application factory.
 *
 * Builds the full middleware stack + mounts route modules. Exported
 * from here (not bound to a port) so tests can supertest against it
 * without spinning up a real server.
 *
 * Middleware order (matters):
 *   1. Trust proxy (Traefik adds X-Forwarded-* headers)
 *   2. JSON body parser
 *   3. Cookie parser (refresh-token cookie)
 *   4. CORS (dev cross-origin, prod same-origin)
 *   5. Request id
 *   6. Request logger
 *   7. Routes (mounted modules — extended each sprint)
 *   8. 404 handler
 *   9. Error handler  ← MUST be last
 */

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { existsSync } from "node:fs";
import path from "node:path";
import { env, isDev } from "./config/env";
import { logger } from "./middleware/logger";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { apiLimiter } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import { requestLogger } from "./middleware/logger";
import { authRouter } from "./modules/auth/auth.routes";
import { calculatorConfigsRouter } from "./modules/calculator-configs/calculator-configs.routes";
import { companiesRouter } from "./modules/companies/companies.routes";
import { dealsRouter } from "./modules/deals/deals.routes";
import { documentsRouter, numberingRouter } from "./modules/documents/documents.routes";
import { healthRouter } from "./modules/health/health.routes";
import { hubspotRouter } from "./modules/hubspot/hubspot.routes";
import { pdfPreviewRouter, pdfRouter } from "./modules/pdf/pdf.routes";
import { usersRouter } from "./modules/users/users.routes";

export function createApp(): express.Express {
  const app = express();

  // 1. Trust proxy — Traefik / Coolify set X-Forwarded-{Proto,For}.
  //    Required for `req.protocol === "https"` and rate-limit key
  //    extraction (express-rate-limit derives the per-IP key from
  //    `req.ip`, which honours this setting).
  //
  //    The hop count MUST match the real number of trusted proxies in
  //    front of the app — see env.ts → TRUST_PROXY_HOPS for the full
  //    rationale. A wrong value lets a client spoof X-Forwarded-For
  //    and bypass per-IP rate limits.
  app.set("trust proxy", env.TRUST_PROXY_HOPS);

  // 1a. Security headers via helmet.
  //     Sprint 7.3.E — enabled CSP as a header (was previously off).
  //     CSP applies to every response Express emits. The SPA's Vite
  //     build doesn't inject scripts from third-party origins, so a
  //     restrictive default-src 'self' policy fits cleanly.
  //
  //     `style-src` allows `'unsafe-inline'` because:
  //       - Tailwind's JIT output may inline styles via <style> tags
  //         in dev mode.
  //       - The PDF builder's HTML contains lots of inline `style=`
  //         attrs — but the PDF flow doesn't go through this app
  //         middleware (Puppeteer fetches HTML via setContent, not
  //         via HTTP), so the CSP header doesn't apply there.
  //     `connect-src 'self'` keeps API calls strictly same-origin.
  //     `frame-ancestors 'none'` (via Helmet default) blocks
  //     clickjacking.
  //
  //     crossOriginEmbedderPolicy stays off because we don't embed
  //     cross-origin resources — turning it on can break dev tools.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // 'self' = same origin. Block all third-party scripts.
          "default-src": ["'self'"],
          "script-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'"],
          "img-src": ["'self'", "data:", "blob:"],
          "connect-src": ["'self'"],
          "font-src": ["'self'", "data:"],
          // PDF preview opens a blob: URL from the same origin —
          // keep blob: allowed for object-src.
          "object-src": ["'self'", "blob:"],
          // No external embeds.
          "frame-src": ["'none'"]
        }
      },
      crossOriginEmbedderPolicy: false
    })
  );

  // 1b. RAW body parser — Sprint 5 webhook receiver only. The HMAC v3
  //    signature is computed over the EXACT request bytes, so the
  //    raw parser MUST run before the generic JSON parser. body-parser
  //    sets `req._body` after consuming the stream, so the JSON
  //    parser below skips this path automatically.
  //    `type: "*/*"` matches any Content-Type (HubSpot historically
  //    sends application/json, but we want the signature check to
  //    be the gatekeeper, not the parser's MIME match).
  //
  //    CRITICAL (Sprint 5.F.3 audit): the path argument MUST remain
  //    `/api/v1/hubspot/webhooks` (exact, single path). Broadening
  //    the scope — e.g. `app.use(express.raw(...))` without a path,
  //    or even `app.use("/api/v1", express.raw(...))` — would shadow
  //    the JSON parser on every endpoint and silently break every
  //    POST in the API. Add new raw-body endpoints by mounting a
  //    SECOND `app.use("/the/specific/path", express.raw(...))`,
  //    never by widening this one.
  app.use(
    "/api/v1/hubspot/webhooks",
    express.raw({ type: "*/*", limit: "1mb" })
  );

  // 2. JSON body parser — limit to 1MB.
  //    DocumentTemplatePayload is ~20KB; 1MB leaves 50× headroom for
  //    schema growth while shrinking the DoS-by-huge-body window
  //    versus the original 5MB cap. Raise only if a legitimate
  //    payload starts approaching this size.
  app.use(express.json({ limit: "1mb" }));

  // 3. Cookie parser for the refresh-token httpOnly cookie. The
  //    raw value is opaque to us; we just hash and compare against
  //    refresh_tokens.token_hash.
  app.use(cookieParser());

  // 4. CORS — in prod the SPA is served by the same Express, so
  //    cross-origin requests are limited to the dev Vite server.
  //    `credentials: true` allows the refresh cookie to ride along.
  app.use(
    cors({
      origin: isDev ? env.FRONTEND_ORIGIN : false,
      credentials: true
    })
  );

  // 5. Per-request correlation id.
  app.use(requestId());

  // 6. Per-request logger (binds req.log + auto-logs request line).
  app.use(requestLogger());

  // ─── Routes ────────────────────────────────────────────────────
  // Mount health endpoints at the ROOT (not under /api/v1) so that
  // Docker / load balancers can ping without API versioning concerns.
  // No rate limiting on /health (probed frequently by docker / k8s).
  app.use(healthRouter);

  // Default API-wide rate limit (60 req/min/IP). Tighter per-route
  // limits (login 5/min, refresh 20/min) are stacked inside the
  // individual route files.
  app.use("/api/v1", apiLimiter);

  // /api/v1/* mounts:
  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/companies", companiesRouter);
  app.use("/api/v1/deals", dealsRouter);
  app.use("/api/v1/hubspot", hubspotRouter);
  app.use("/api/v1/calculator-configs", calculatorConfigsRouter);
  app.use("/api/v1/documents", documentsRouter);
  app.use("/api/v1/documents", pdfRouter); // mounts /:number/pdf
  app.use("/api/v1/pdf", pdfPreviewRouter); // mounts POST /preview (Sprint 6.0)
  app.use("/api/v1/numbering", numberingRouter);
  // Sprint 5 routes (POST /api/v1/hubspot/webhooks + POST /api/v1/hubspot/refresh)
  // are mounted as children of hubspotRouter above.

  // Sprint 7.3.A — single-container deploy. Express serves the
  // built SPA static assets so we don't need a separate nginx.
  // The build stage in Dockerfile copies `dist/` to `/srv/spa/`;
  // in dev the SPA is served by `vite` on a different port and
  // these handlers are skipped (the directory doesn't exist).
  //
  // Two handlers mounted after the API routes:
  //   1. express.static — serves the actual files (index.html,
  //      assets/*, etc.) with `index: false` so we control the
  //      fallback in step 2.
  //   2. The SPA-history fallback — any non-API request that
  //      didn't match a static file gets `index.html`, letting
  //      React Router handle the route on the client.
  //
  // SPA_DIST_DIR env override exists so tests can point at a
  // fixture; default `/srv/spa` matches the Dockerfile layout.
  const spaDistDir = env.SPA_DIST_DIR ?? "/srv/spa";
  if (existsSync(spaDistDir)) {
    app.use(
      express.static(spaDistDir, {
        index: false,
        // Cache hashed assets (Vite produces content-hashed
        // filenames like `index-abc123.js`) for a year; the
        // entry HTML is served fresh below.
        maxAge: "1y",
        immutable: true
      })
    );
    app.get("*", (req, res, next) => {
      // Only serve the SPA shell for navigations that didn't
      // match a static file AND aren't an API call. The /api/*
      // routes are mounted above; a missed /api/* path falls
      // through to the 404 handler at the end of this stack.
      if (req.path.startsWith("/api/")) return next();
      // No-cache on index.html so a deploy is picked up by every
      // tab on the next navigation without a hard refresh.
      res.set("Cache-Control", "no-cache, no-store, must-revalidate");
      res.sendFile(path.join(spaDistDir, "index.html"));
    });
    logger.info({ spaDistDir }, "[app] serving SPA static from this dir");
  } else if (!isDev) {
    // Prod boot WITHOUT the SPA build is a misconfiguration —
    // warn loudly. In dev this is normal (Vite serves the SPA).
    logger.warn(
      { spaDistDir },
      "[app] SPA dist dir not found — Express will serve API only"
    );
  }

  // 8. 404 catch-all + 9. Error envelope — must be last.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
