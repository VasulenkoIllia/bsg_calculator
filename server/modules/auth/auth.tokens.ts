/**
 * Token utilities — JWT (access) + opaque random (refresh).
 *
 * Access token: short-lived JWT, signed with JWT_ACCESS_SECRET.
 *   Payload: { sub: <userId>, isAdmin: <bool> }
 *   Verified on every authenticated API request.
 *
 * Refresh token: opaque random 32 bytes, base64url-encoded.
 *   The raw value lives only in the httpOnly cookie + (briefly) the
 *   client memory. We store SHA-256 of it in refresh_tokens.token_hash.
 *   Never expose the raw value in a response body.
 */

import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";

// ─── Access JWT ─────────────────────────────────────────────────────

export interface AccessTokenPayload {
  sub: string;       // user id
  isAdmin: boolean;
}

export function signAccessToken(userId: string, isAdmin: boolean): string {
  const payload: AccessTokenPayload = { sub: userId, isAdmin };
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    // jsonwebtoken's `expiresIn` is typed as a string-literal union
    // (`"15m" | "1h" | ...`), so a plain `string` from env doesn't
    // satisfy the type even though it's accepted at runtime. The
    // env-loader Zod schema validates the format upstream; this cast
    // bridges the type mismatch without losing safety.
    expiresIn: env.JWT_ACCESS_EXPIRES as jwt.SignOptions["expiresIn"],
    issuer: env.APP_NAME
  });
}

export class AccessTokenVerificationError extends Error {
  constructor(public reason: "expired" | "invalid", message: string) {
    super(message);
    this.name = "AccessTokenVerificationError";
  }
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
      issuer: env.APP_NAME
    });
    if (typeof decoded === "string") {
      throw new AccessTokenVerificationError("invalid", "Unexpected JWT payload type.");
    }
    const { sub, isAdmin } = decoded as jwt.JwtPayload & { isAdmin?: boolean };
    if (typeof sub !== "string" || typeof isAdmin !== "boolean") {
      throw new AccessTokenVerificationError("invalid", "JWT payload missing required claims.");
    }
    return { sub, isAdmin };
  } catch (err) {
    if (err instanceof AccessTokenVerificationError) throw err;
    if (err instanceof jwt.TokenExpiredError) {
      throw new AccessTokenVerificationError("expired", "Access token expired.");
    }
    throw new AccessTokenVerificationError("invalid", "Access token invalid.");
  }
}

// ─── Refresh token (opaque random) ─────────────────────────────────

/**
 * Generate a fresh opaque refresh token. 32 random bytes →
 * base64url-encoded → ~43 chars. Cryptographically unguessable.
 */
export function generateRefreshTokenRaw(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hash of a raw refresh token — what we store in the DB. */
export function hashRefreshToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Compute expiry timestamp for a freshly issued refresh token. */
export function refreshTokenExpiry(): Date {
  // Parse `JWT_REFRESH_EXPIRES` (e.g. "30d") into milliseconds.
  // jsonwebtoken accepts the same string format but we need a Date for
  // the DB column.
  const expires = env.JWT_REFRESH_EXPIRES;
  const match = /^(\d+)([smhdw])$/.exec(expires);
  if (!match) {
    // Fall back to 30 days if env value is unusual; env loader Zod
    // already restricts the format upstream.
    return new Date(Date.now() + 30 * 24 * 3600 * 1000);
  }
  const value = Number.parseInt(match[1], 10);
  const unit = match[2];
  const multiplier: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 3600 * 1000,
    d: 24 * 3600 * 1000,
    w: 7 * 24 * 3600 * 1000
  };
  return new Date(Date.now() + value * multiplier[unit]);
}
