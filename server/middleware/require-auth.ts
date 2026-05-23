/**
 * JWT verification middleware.
 *
 * Reads the access token from `Authorization: Bearer <token>`, verifies
 * it, attaches the user info to `req.user`. Throws into the error
 * envelope on missing / invalid / expired token.
 *
 * Mounted on all `/api/v1/*` routes EXCEPT:
 *   - /auth/login          (no token yet)
 *   - /auth/refresh        (refresh cookie, not access token)
 *   - /hubspot/webhooks    (HMAC, not JWT)
 *   - /health, /ready      (mounted at root, no auth)
 *
 * See `phase_08_backend_plan.md` §4.0 auth matrix.
 */

import type { NextFunction, Request, Response } from "express";
import {
  AccessTokenVerificationError,
  verifyAccessToken
} from "../modules/auth/auth.tokens";
import { loadActiveUser } from "../modules/auth/auth.service";
import { TokenExpiredError, TokenInvalidError } from "../shared/errors";

export function requireAuth() {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const header = req.header("authorization") ?? "";
      const match = /^Bearer\s+(.+)$/i.exec(header);
      if (!match) {
        throw new TokenInvalidError("Missing or malformed Authorization header.");
      }

      const payload = verifyAccessToken(match[1]);

      // Re-fetch user for is_active check + email. Hot path, but the
      // PK lookup is sub-ms and we get correct behaviour when an
      // admin disables a user mid-session. Goes through the service
      // (NOT repository directly) per backend_conventions.md §1.
      const user = await loadActiveUser(payload.sub);

      // Sprint 9.L N5 — IMPORTANT: req.user.role comes from the live
      // DB row (`loadActiveUser`), NOT from the JWT claim. The JWT
      // also carries a `role` claim (Phase 8 Stage 1) used by the
      // refresh path + ergonomic logging, but route-level decisions
      // must trust the DB so a role demotion takes effect on the
      // NEXT request rather than after the access token's 15-minute
      // TTL expires. A future regression would be: forwarding
      // `payload.role` here instead of `user.role` — that would let
      // a downgraded admin keep admin privileges until token expiry.
      req.user = {
        id: user.id,
        email: user.email,
        // Sprint 9.V audit fix M1 — carry displayName so audit-action
        // writes don't re-fetch the user row. The `user` row is
        // already in hand here; no extra DB cost.
        displayName: user.displayName,
        role: user.role
      };
      next();
    } catch (err) {
      if (err instanceof AccessTokenVerificationError) {
        next(err.reason === "expired" ? new TokenExpiredError() : new TokenInvalidError());
        return;
      }
      next(err);
    }
  };
}
