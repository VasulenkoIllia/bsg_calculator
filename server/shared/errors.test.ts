import { describe, expect, it } from "vitest";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  InternalError,
  InvalidCredentialsError,
  NotFoundError,
  RateLimitedError,
  TokenExpiredError,
  TokenInvalidError,
  ValidationError,
  isAppError
} from "./errors";

describe("AppError + subclasses", () => {
  it("AppError sets status / code / message / details", () => {
    const err = new AppError(418, "I_AM_A_TEAPOT", "Short and stout.", { extra: 1 });
    expect(err.status).toBe(418);
    expect(err.code).toBe("I_AM_A_TEAPOT");
    expect(err.message).toBe("Short and stout.");
    expect(err.details).toEqual({ extra: 1 });
    expect(err.name).toBe("AppError");
  });

  it("ValidationError defaults to 400 + VALIDATION_FAILED", () => {
    const err = new ValidationError([{ path: ["x"], message: "bad" }]);
    expect(err.status).toBe(400);
    expect(err.code).toBe("VALIDATION_FAILED");
    expect(err.details).toEqual([{ path: ["x"], message: "bad" }]);
  });

  it("InvalidCredentialsError → 401 / AUTH_INVALID_CREDENTIALS", () => {
    const err = new InvalidCredentialsError();
    expect(err.status).toBe(401);
    expect(err.code).toBe("AUTH_INVALID_CREDENTIALS");
  });

  it("TokenExpiredError → 401 / AUTH_TOKEN_EXPIRED", () => {
    expect(new TokenExpiredError().code).toBe("AUTH_TOKEN_EXPIRED");
  });

  it("TokenInvalidError → 401 / AUTH_TOKEN_INVALID", () => {
    expect(new TokenInvalidError().code).toBe("AUTH_TOKEN_INVALID");
  });

  it("ForbiddenError → 403 / FORBIDDEN", () => {
    expect(new ForbiddenError().status).toBe(403);
    expect(new ForbiddenError().code).toBe("FORBIDDEN");
  });

  it("NotFoundError → 404 / RESOURCE_NOT_FOUND", () => {
    const err = new NotFoundError("Widget");
    expect(err.status).toBe(404);
    expect(err.code).toBe("RESOURCE_NOT_FOUND");
    expect(err.message).toBe("Widget not found.");
  });

  it("ConflictError → 409 with custom code", () => {
    const err = new ConflictError("CONFLICT_FOO", "Foo dup.");
    expect(err.status).toBe(409);
    expect(err.code).toBe("CONFLICT_FOO");
  });

  it("RateLimitedError → 429 / RATE_LIMITED", () => {
    expect(new RateLimitedError().status).toBe(429);
    expect(new RateLimitedError().code).toBe("RATE_LIMITED");
  });

  it("InternalError hides internalMessage from public envelope", () => {
    const err = new InternalError("SECRET: stack trace details");
    // Public message is always the safe generic.
    expect(err.message).toBe("Something went wrong on our end.");
    // Internal-only field carries the real reason for logging.
    expect(err.internalMessage).toBe("SECRET: stack trace details");
    expect(err.code).toBe("INTERNAL_ERROR");
    expect(err.status).toBe(500);
  });

  it("isAppError type-guards subclasses", () => {
    expect(isAppError(new ValidationError([]))).toBe(true);
    expect(isAppError(new Error("plain"))).toBe(false);
    expect(isAppError(null)).toBe(false);
    expect(isAppError(undefined)).toBe(false);
  });
});
