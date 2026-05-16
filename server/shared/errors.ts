/**
 * Error envelope contract.
 *
 * Every error response across the API has shape:
 *   { error: { code: string, message: string, details?: unknown } }
 *
 * Controllers throw `AppError` (or one of its subclasses); the
 * `error-handler` middleware turns the thrown instance into the
 * envelope + HTTP status. Codes are stable strings — frontend may
 * switch on them.
 *
 * See `docs/backend_conventions.md` §2 for the full code table.
 */

export class AppError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// ─── 4xx — client error subclasses ──────────────────────────────────

export class ValidationError extends AppError {
  constructor(details: unknown, message = "Request payload is invalid.") {
    super(400, "VALIDATION_FAILED", message, details);
    this.name = "ValidationError";
  }
}

export class InvalidCredentialsError extends AppError {
  constructor(message = "Email or password is incorrect.") {
    super(401, "AUTH_INVALID_CREDENTIALS", message);
    this.name = "InvalidCredentialsError";
  }
}

export class TokenExpiredError extends AppError {
  constructor(message = "Authentication token has expired.") {
    super(401, "AUTH_TOKEN_EXPIRED", message);
    this.name = "TokenExpiredError";
  }
}

export class TokenInvalidError extends AppError {
  constructor(message = "Authentication token is invalid or revoked.") {
    super(401, "AUTH_TOKEN_INVALID", message);
    this.name = "TokenInvalidError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You don't have permission to perform this action.") {
    super(403, "FORBIDDEN", message);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource", message?: string) {
    super(404, "RESOURCE_NOT_FOUND", message ?? `${resource} not found.`);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(code: string, message: string, details?: unknown) {
    super(409, code, message, details);
    this.name = "ConflictError";
  }
}

export class UnprocessableError extends AppError {
  constructor(code: string, message: string, details?: unknown) {
    super(422, code, message, details);
    this.name = "UnprocessableError";
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Too many requests. Slow down.") {
    super(429, "RATE_LIMITED", message);
    this.name = "RateLimitedError";
  }
}

// ─── 5xx — server error subclasses ──────────────────────────────────

export class InternalError extends AppError {
  // `internalMessage` is logged but NOT exposed to clients — the
  // envelope always says "Something went wrong on our end." for 500s
  // to avoid leaking implementation details. The error-handler reads
  // this field to enrich the log line.
  public readonly internalMessage: string;

  constructor(internalMessage = "Internal error.") {
    super(500, "INTERNAL_ERROR", "Something went wrong on our end.");
    this.name = "InternalError";
    this.internalMessage = internalMessage;
  }
}

export class HubspotUnreachableError extends AppError {
  constructor(message = "HubSpot upstream is unreachable.", details?: unknown) {
    super(502, "HUBSPOT_UNREACHABLE", message, details);
    this.name = "HubspotUnreachableError";
  }
}

export class DbUnavailableError extends AppError {
  constructor(message = "Database is temporarily unavailable.") {
    super(503, "DB_UNAVAILABLE", message);
    this.name = "DbUnavailableError";
  }
}

// Type guard used by the error-handler middleware.
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
