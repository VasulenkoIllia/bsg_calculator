/**
 * Final error-handling middleware.
 *
 * Express invokes 4-arg middleware as the error path. Renders the
 * stable `{ error: { code, message, details? } }` envelope.
 *
 * Order matters: this MUST be mounted last on the Express app,
 * AFTER all route handlers.
 */

import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import {
  AppError,
  HubspotUnreachableError,
  InternalError,
  ValidationError,
  isAppError
} from "../shared/errors";
import { logger } from "./logger";

/**
 * Sprint 9.L B5 — scrub fields from an error's `details` that should
 * be logged server-side but never exposed in the client envelope.
 *
 * HubspotUnreachableError.details currently carries `{ status, url }`
 * for ops debugging — exposing the URL leaks our HubSpot endpoint
 * path (e.g. `/crm/v3/objects/notes/12345`) to the client. We strip
 * it here while keeping the field in the structured log line above.
 *
 * Returns the original details unchanged when nothing needed scrubbing.
 */
function scrubDetailsForClient(appError: AppError): unknown {
  if (appError.details === undefined || appError.details === null) {
    return appError.details;
  }
  if (
    appError instanceof HubspotUnreachableError &&
    typeof appError.details === "object" &&
    !Array.isArray(appError.details)
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { url: _url, ...rest } = appError.details as Record<string, unknown>;
    return rest;
  }
  return appError.details;
}

interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

// Express recognises a middleware as the error path by its 4-arg
// signature. The `_next` is required even when unused.
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  // Normalise raw ZodErrors (thrown by .parse()) into ValidationError
  // so we have a single rendering path.
  let appError: AppError;
  if (err instanceof ZodError) {
    appError = new ValidationError(err.issues);
  } else if (isAppError(err)) {
    appError = err;
  } else {
    // Unknown error — wrap in InternalError. Capture the original
    // message for the log; the envelope stays generic.
    const message = err instanceof Error ? err.message : String(err);
    appError = new InternalError(message);
  }

  // Log with full context. 5xx → error level; 4xx → warn; pino-http
  // already logged the request line, so we add ONE extra log entry
  // with `err` + `code` for correlation.
  const reqLog = (req as Request).log ?? logger;
  const logCtx: Record<string, unknown> = {
    code: appError.code,
    status: appError.status,
    reqId: req.id
  };

  if (err instanceof Error && err.stack) {
    logCtx.stack = err.stack;
  }
  if (appError instanceof InternalError) {
    logCtx.internalMessage = appError.internalMessage;
  }

  if (appError.status >= 500) {
    reqLog.error(logCtx, appError.message);
  } else {
    reqLog.warn(logCtx, appError.message);
  }

  // Build response envelope. `details` is only included when present.
  // Sprint 9.L B5 — run scrubDetailsForClient() on the way out so
  // upstream-URL leaks (HubspotUnreachableError) stay in the log
  // but never reach the client.
  const safeDetails = scrubDetailsForClient(appError);
  const envelope: ErrorEnvelope = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(safeDetails !== undefined ? { details: safeDetails } : {})
    }
  };

  // If headers were already sent (e.g. mid-stream), there's nothing
  // we can do. Let Express terminate the connection.
  if (res.headersSent) {
    return;
  }

  res.status(appError.status).json(envelope);
}

/**
 * Catch-all 404 — mounted AFTER all routes, BEFORE the error handler.
 * Express has no built-in for this; without it, unmatched routes hang.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: "RESOURCE_NOT_FOUND",
      message: `Cannot ${req.method} ${req.originalUrl}.`
    }
  });
}
