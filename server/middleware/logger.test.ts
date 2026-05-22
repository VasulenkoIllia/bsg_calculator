/**
 * Unit tests for the logger token-redaction helper.
 *
 * Sprint 9.O audit fix M1 — the request-URL serializer must mask
 * raw one-time tokens that ride in path segments on the invite +
 * password-reset endpoints. This test pins the exact patterns to
 * avoid regressions.
 */

import { describe, expect, it } from "vitest";
import { redactTokenInUrl } from "./logger";

describe("redactTokenInUrl", () => {
  it("masks the raw token in /api/v1/auth/invite/<token>", () => {
    expect(redactTokenInUrl("/api/v1/auth/invite/abc123def456")).toBe(
      "/api/v1/auth/invite/[redacted]"
    );
  });

  it("masks the raw token in /api/v1/auth/invite/<token>/accept", () => {
    expect(
      redactTokenInUrl("/api/v1/auth/invite/abc123def456/accept")
    ).toBe("/api/v1/auth/invite/[redacted]/accept");
  });

  it("masks the raw token in /api/v1/auth/password-reset/<token>", () => {
    expect(
      redactTokenInUrl("/api/v1/auth/password-reset/xyz789ghi012")
    ).toBe("/api/v1/auth/password-reset/[redacted]");
  });

  it("leaves unrelated URLs untouched", () => {
    expect(redactTokenInUrl("/api/v1/auth/login")).toBe("/api/v1/auth/login");
    expect(redactTokenInUrl("/api/v1/users/123")).toBe("/api/v1/users/123");
    expect(redactTokenInUrl("/health")).toBe("/health");
  });

  it("preserves query strings on invite/reset URLs", () => {
    // Currently the routes don't use query strings, but if they ever
    // gained `?reason=...` or similar, the mask should leave the
    // query intact. The regex stops at the first `/` or `?`.
    expect(
      redactTokenInUrl("/api/v1/auth/invite/abc123?foo=bar")
    ).toBe("/api/v1/auth/invite/[redacted]?foo=bar");
  });

  it("handles real-world base64url token format", () => {
    // The actual generator is randomBytes(32).toString("base64url"),
    // which produces 43-char strings using [A-Za-z0-9_-]. Pin a
    // realistic example.
    const realLikeToken = "ah-7F8k89J9leMBLL1UK6j-js9n8z2HFaJrkxkW5754";
    expect(
      redactTokenInUrl(`/api/v1/auth/invite/${realLikeToken}/accept`)
    ).toBe("/api/v1/auth/invite/[redacted]/accept");
  });
});
