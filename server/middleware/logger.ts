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

import type { NextFunction, Request, Response } from "express";
import pino from "pino";
import pinoHttp from "pino-http";
import { env, isDev } from "../config/env";

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
  timestamp: pino.stdTimeFunctions.isoTime
});

/**
 * Per-request HTTP logger.
 *
 * - Re-uses `req.id` from the request-id middleware (mounted BEFORE this).
 * - Attaches `req.log` as a child logger with `reqId` bound, so any
 *   downstream log line carries the correlation id.
 * - Logs ONE line per request with status + duration. The default
 *   pino-http serializer is conservative — it does NOT log body.
 */
export function requestLogger() {
  // pino-http appends a property of its own; we want it to be `req.log`
  // on `Request`, matching our type augmentation.
  const middleware = pinoHttp({
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
        url: req.url,
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

  return (req: Request, res: Response, next: NextFunction): void => {
    middleware(req, res);
    next();
  };
}
