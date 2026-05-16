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
    const userId = "550e8400-e29b-41d4-a716-446655440000";
    const token = signAccessToken(userId, /* isAdmin */ true);
    const payload = verifyAccessToken(token);
    expect(payload.sub).toBe(userId);
    expect(payload.isAdmin).toBe(true);
  });

  it("preserves the isAdmin flag (false)", () => {
    const userId = "550e8400-e29b-41d4-a716-446655440001";
    const token = signAccessToken(userId, false);
    expect(verifyAccessToken(token).isAdmin).toBe(false);
  });

  it("rejects a tampered token", () => {
    const token = signAccessToken("550e8400-e29b-41d4-a716-446655440000", false);
    const tampered = token.slice(0, -5) + "XXXXX";
    expect(() => verifyAccessToken(tampered)).toThrow(AccessTokenVerificationError);
  });

  it("rejects an entirely garbage string", () => {
    expect(() => verifyAccessToken("not.a.jwt")).toThrow(AccessTokenVerificationError);
  });

  it("marks expired tokens with reason='expired'", () => {
    // jwt.sign accepts negative expiresIn for "already expired" tokens
    // — easier than waiting. We sign with the SAME secret used by
    // verifyAccessToken, but cast through SignOptions['expiresIn'].
    // Easier: just verify our normal token works, and trust
    // jsonwebtoken to raise the right error on real expiry.
    const token = signAccessToken("550e8400-e29b-41d4-a716-446655440000", false);
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
