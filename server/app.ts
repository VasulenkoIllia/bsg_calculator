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
import { env, isDev } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/error-handler";
import { apiLimiter } from "./middleware/rate-limit";
import { requestId } from "./middleware/request-id";
import { requestLogger } from "./middleware/logger";
import { authRouter } from "./modules/auth/auth.routes";
import { healthRouter } from "./modules/health/health.routes";
import { usersRouter } from "./modules/users/users.routes";

export function createApp(): express.Express {
  const app = express();

  // 1. Trust proxy — Traefik / Coolify set X-Forwarded-{Proto,For}.
  //    Required for `req.protocol === "https"` and rate-limit key
  //    extraction.
  app.set("trust proxy", 1);

  // 1a. Security headers via helmet.
  //     - contentSecurityPolicy disabled here: prod serves the SPA's
  //       built bundle with its own meta CSP set during Vite build,
  //       and the API endpoints return JSON with no scripts. Phase
  //       8.7 hardening may re-enable per route once we own the SPA
  //       serving config.
  //     - crossOriginEmbedderPolicy disabled because we serve no
  //       cross-origin embeds.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false
    })
  );

  // 2. JSON body parser — limit to 5MB (DocumentTemplatePayload is
  //    ~20KB; a generous cap absorbs future schema growth without
  //    enabling DoS-by-huge-body).
  app.use(express.json({ limit: "5mb" }));

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
  // Future sprints: companies, deals, calculator-configs,
  //                  documents, listings, hubspot, pdf.

  // 8. 404 catch-all + 9. Error envelope — must be last.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
