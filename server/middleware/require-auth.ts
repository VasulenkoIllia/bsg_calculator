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
import { findUserById } from "../modules/auth/auth.repository";
import {
  ForbiddenError,
  TokenExpiredError,
  TokenInvalidError
} from "../shared/errors";

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
      // admin disables a user mid-session.
      const user = await findUserById(payload.sub);
      if (!user) {
        throw new TokenInvalidError("Token references a deleted user.");
      }
      if (!user.isActive) {
        throw new ForbiddenError("Account is disabled.");
      }

      req.user = {
        id: user.id,
        email: user.email,
        isAdmin: user.isAdmin
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
