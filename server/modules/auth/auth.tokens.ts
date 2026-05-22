/**
 * Token utilities — JWT (access) + opaque random (refresh).
 *
 * Access token: short-lived JWT, signed with JWT_ACCESS_SECRET.
 *   Payload: { sub: <userId>, role: <"user"|"admin"|"super_admin"> }
 *   Verified on every authenticated API request.
 *
 *   Phase 8 Stage 1: the legacy `isAdmin: boolean` claim was replaced
 *   with the hierarchical `role` enum. Tokens minted before the
 *   migration are rejected as "invalid" (force re-login) — existing
 *   sessions have at most JWT_ACCESS_EXPIRES (default 15 min) to
 *   pick up the new claim shape via /auth/refresh.
 *
 * Refresh token: opaque random 32 bytes, base64url-encoded.
 *   The raw value lives only in the httpOnly cookie + (briefly) the
 *   client memory. We store SHA-256 of it in refresh_tokens.token_hash.
 *   Never expose the raw value in a response body.
 */

import { createHash, randomBytes } from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";
import { USER_ROLES, type UserRole } from "../../db/schema";

// ─── Access JWT ─────────────────────────────────────────────────────

export interface AccessTokenPayload {
  sub: string;       // user id
  role: UserRole;
}

export function signAccessToken(userId: string, role: UserRole): string {
  const payload: AccessTokenPayload = { sub: userId, role };
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
    const { sub, role } = decoded as jwt.JwtPayload & { role?: string };
    if (typeof sub !== "string") {
      throw new AccessTokenVerificationError("invalid", "JWT payload missing sub claim.");
    }
    // Phase 8 Stage 1: stale pre-migration tokens lack `role` and will
    // land here; surface as "invalid" so the client refreshes (and
    // the new refresh issues a token with the role claim).
    if (typeof role !== "string" || !USER_ROLES.includes(role as UserRole)) {
      throw new AccessTokenVerificationError(
        "invalid",
        "JWT payload missing or unrecognised role claim."
      );
    }
    return { sub, role: role as UserRole };
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

/**
 * Sprint 9.P default — 12h. Must match the `JWT_REFRESH_EXPIRES`
 * default in `server/config/env.ts`. Used only as the
 * defence-in-depth fallback in `refreshTokenMaxAgeMs()` when the
 * env value somehow bypassed Zod validation (shouldn't happen).
 */
const DEFAULT_REFRESH_MAX_AGE_MS = 12 * 3600 * 1000;

/**
 * Compute the configured refresh-token TTL in milliseconds. Single
 * source of truth — both the DB `refresh_tokens.expires_at` column
 * (via `refreshTokenExpiry()`) and the Set-Cookie max-age (via
 * `auth.cookies.refreshCookieOptions`) derive from this so they
 * can't drift independently.
 *
 * Falls back to 12 hours (the Sprint 9.P default) if the env value
 * is malformed — the Zod schema already enforces format upstream,
 * so this fallback should never fire in practice.
 */
export function refreshTokenMaxAgeMs(): number {
  const expires = env.JWT_REFRESH_EXPIRES;
  const match = /^(\d+)([smhdw])$/.exec(expires);
  if (!match) return DEFAULT_REFRESH_MAX_AGE_MS;

  const value = Number.parseInt(match[1], 10);
  const unit = match[2];
  const multiplier: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 3600 * 1000,
    d: 24 * 3600 * 1000,
    w: 7 * 24 * 3600 * 1000
  };
  return value * multiplier[unit];
}

/** Compute expiry timestamp for a freshly issued refresh token. */
export function refreshTokenExpiry(): Date {
  return new Date(Date.now() + refreshTokenMaxAgeMs());
}
