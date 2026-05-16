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
  InternalError,
  ValidationError,
  isAppError
} from "../shared/errors";
import { logger } from "./logger";

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
  const envelope: ErrorEnvelope = {
    error: {
      code: appError.code,
      message: appError.message,
      ...(appError.details !== undefined ? { details: appError.details } : {})
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
