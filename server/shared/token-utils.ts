/**
 * Sprint 9.O — shared opaque-token utilities.
 *
 * Used by both `invites` and `password-resets` modules. Extracted
 * here so the two peer modules don't have one importing from the
 * other (resets used to pull `generateRawToken`/`hashToken` from
 * `invites.repository`, which made `invites` look like a parent
 * module — it isn't).
 *
 * The pattern is:
 *   1. `generateRawToken()` mints a 32-byte cryptorandom URL-safe
 *      string. Returned ONCE to the operator via the API response;
 *      never re-fetchable, never logged.
 *   2. `hashToken(raw)` produces the sha256 hex digest. ONLY this
 *      hash is persisted in `*.token_hash`. A breach of the DB
 *      cannot reveal the raw tokens.
 *   3. Lookup is `WHERE token_hash = $1` — equivalent to constant-
 *      time at the indexed-lookup layer; the raw 256-bit entropy
 *      makes timing-assisted brute force infeasible.
 *
 * HMAC is intentionally not used: HMAC is needed when the DB holder
 * should not be able to forge a hash. Here the DB IS the trust
 * anchor — anyone with DB write access can already mint rows.
 */

import { createHash, randomBytes } from "node:crypto";

/**
 * Generate a cryptographically random URL-safe token. 32 bytes of
 * entropy → 43 chars base64url — enough that a brute-force attack
 * is computationally infeasible regardless of how many rows the
 * attacker can probe.
 */
export function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * sha256 hex digest. Stable, deterministic, and the same as what
 * the existing `refresh_tokens` table uses for the refresh cookie
 * (so anyone reading the codebase recognises the pattern).
 */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}
