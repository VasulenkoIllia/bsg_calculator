import { describe, expect, it } from "vitest";
import {
  AccessTokenVerificationError,
  generateRefreshTokenRaw,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
  verifyAccessToken
} from "./auth.tokens";

describe("auth.tokens — JWT access token", () => {
  it("signs + verifies a valid access token round-trip", () => {
    // Phase 8 Stage 1: role enum replaces the legacy isAdmin boolean.
    const userId = "550e8400-e29b-41d4-a716-446655440000";
    const token = signAccessToken(userId, "admin");
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe(userId);
    expect(payload.role).toBe("admin");
  });

  it("preserves the role claim (user)", () => {
    const userId = "550e8400-e29b-41d4-a716-446655440001";
    const token = signAccessToken(userId, "user");
    expect(verifyAccessToken(token).role).toBe("user");
  });

  it("preserves the role claim (super_admin)", () => {
    const userId = "550e8400-e29b-41d4-a716-446655440002";
    const token = signAccessToken(userId, "super_admin");
    expect(verifyAccessToken(token).role).toBe("super_admin");
  });

  it("rejects a tampered token", () => {
    const token = signAccessToken("550e8400-e29b-41d4-a716-446655440000", "user");
    const tampered = token.slice(0, -5) + "XXXXX";
    expect(() => verifyAccessToken(tampered)).toThrow(AccessTokenVerificationError);
  });

  it("rejects an entirely garbage string", () => {
    expect(() => verifyAccessToken("not.a.jwt")).toThrow(AccessTokenVerificationError);
  });

  it("normal token verifies successfully (smoke for expiry pipeline)", () => {
    const token = signAccessToken("550e8400-e29b-41d4-a716-446655440000", "user");
    expect(verifyAccessToken(token).sub).toBe("550e8400-e29b-41d4-a716-446655440000");
  });
});

describe("auth.tokens — refresh token", () => {
  it("generates a base64url-encoded random string", () => {
    const raw = generateRefreshTokenRaw();
    // 32 bytes base64url = 43 chars (no padding).
    expect(raw).toHaveLength(43);
    // base64url uses [A-Za-z0-9_-] only.
    expect(raw).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("two consecutive calls produce different tokens", () => {
    expect(generateRefreshTokenRaw()).not.toBe(generateRefreshTokenRaw());
  });

  it("hashRefreshToken is deterministic + 64-char hex", () => {
    const raw = "test-token";
    const a = hashRefreshToken(raw);
    const b = hashRefreshToken(raw);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
    expect(a).toMatch(/^[0-9a-f]+$/);
  });

  it("hashRefreshToken differs for different inputs", () => {
    expect(hashRefreshToken("a")).not.toBe(hashRefreshToken("b"));
  });

  it("refreshTokenExpiry returns a future Date ~30 days out", () => {
    const before = Date.now();
    const expiry = refreshTokenExpiry();
    const after = Date.now();
    // JWT_REFRESH_EXPIRES default is "30d" → ~2.6M seconds.
    // Allow a generous window for parsing.
    const thirtyDaysMs = 30 * 24 * 3600 * 1000;
    expect(expiry.getTime() - before).toBeGreaterThanOrEqual(thirtyDaysMs - 5000);
    expect(expiry.getTime() - after).toBeLessThanOrEqual(thirtyDaysMs + 5000);
  });
});
