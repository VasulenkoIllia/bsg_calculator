/**
 * Pino logger + pino-http request logger.
 *
 * Logger conventions (docs/backend_conventions.md §3):
 *   - JSON output only, NEVER console.log in production code
 *   - Required fields per line: ts, level, msg
 *   - Encouraged fields: reqId, userId, route, durationMs
 *   - Level guidelines: error / warn / info / debug (see docs)
 *   - HTTP request logging: one line per request, NEVER log body
 */

import type { Request } from "express";
import pino from "pino";
import pinoHttp from "pino-http";
import { env, isDev } from "../config/env";

/**
 * Keys we never want to see in logs. pino's `redact` walks the
 * log object using the provided paths and replaces matches with
 * `[Redacted]`. Both root keys (e.g. `password`) and one-level
 * nested keys (e.g. `req.headers.authorization`) are covered.
 *
 * If a request handler ever logs an error that wraps a token or a
 * cookie value, the redact pass catches it before it hits stdout.
 */
const REDACT_PATHS = [
  // Top-level keys commonly attached to log payloads.
  "password",
  "newPassword",
  "currentPassword",
  "token",
  "accessToken",
  "refreshToken",
  "refreshTokenRaw",
  "authorization",
  "cookie",
  // Wildcards: any nested object whose property is one of these.
  "*.password",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.refreshTokenRaw",
  "*.authorization",
  "*.cookie",
  // Headers attached by pino-http's default req serializer.
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.authorization",
  "headers.cookie"
];

/**
 * Sprint 9.O audit fix M1 — strip raw one-time tokens out of the
 * request URL before it lands in logs. The invite + password-reset
 * routes carry the raw token as a path segment, so the URL itself
 * is sensitive (`req.url = "/api/v1/auth/invite/<live-token>/accept"`).
 * REDACT_PATHS handles header/body keys but NOT URL path segments,
 * so we mask them here in the serializer.
 *
 * Patterns covered:
 *   /api/v1/auth/invite/<token>
 *   /api/v1/auth/invite/<token>/accept
 *   /api/v1/auth/password-reset/<token>
 *
 * The token is replaced with the literal string `[redacted]` so the
 * URL shape is still useful for diagnostics ("a request hit the
 * invite-accept endpoint with status 404") without leaking the token
 * value to anyone with log access.
 */
export function redactTokenInUrl(url: string): string {
  return url.replace(
    /^(\/api\/v1\/auth\/(?:invite|password-reset)\/)([^/?]+)/,
    "$1[redacted]"
  );
}

export const logger = pino({
  level: env.LOG_LEVEL,
  // Pretty-print in dev for readability; JSON in prod for log
  // aggregators (Loki, Datadog, etc.) to parse.
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss.l",
          ignore: "pid,hostname"
        }
      }
    : undefined,
  base: {
    app: env.APP_NAME
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: REDACT_PATHS,
    censor: "[Redacted]"
  }
});

/**
 * Per-request HTTP logger.
 *
 * Returns the pino-http middleware DIRECTLY (no wrapper) because
 * pino-http already calls `next()` itself; double-calling is a
 * subtle pattern violation that can confuse downstream middleware.
 *
 * - Re-uses `req.id` from the request-id middleware (mounted BEFORE this).
 * - Attaches `req.log` as a child logger with `reqId` bound, so any
 *   downstream log line carries the correlation id.
 * - Logs ONE line per request with status + duration. The default
 *   pino-http serializer is conservative — it does NOT log body.
 */
export const requestLogger = () =>
  pinoHttp({
    logger,
    genReqId: req => (req as Request).id, // re-use already-assigned id
    customLogLevel: (_req, res, err) => {
      if (err || res.statusCode >= 500) return "error";
      if (res.statusCode >= 400) return "warn";
      return "info";
    },
    // Trim verbose default serializers — keep only what's useful.
    serializers: {
      req: req => ({
        method: req.method,
        // Sprint 9.O audit fix M1 — mask raw one-time tokens carried
        // as path segments on the invite + password-reset endpoints.
        // No-op for any other URL.
        url: redactTokenInUrl(req.url),
        remoteAddress: req.remoteAddress,
        userAgent: req.headers?.["user-agent"]
      }),
      res: res => ({
        statusCode: res.statusCode
      })
    },
    // Skip noisy /health pings in prod logs.
    autoLogging: env.LOG_HTTP_REQUESTS
      ? {
          ignore: req => req.url === "/health"
        }
      : false
  });
