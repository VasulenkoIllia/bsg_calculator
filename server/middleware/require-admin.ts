/**
 * Admin-only middleware.
 *
 * Mounted AFTER `requireAuth()` on routes that need admin role.
 * `requireAuth` populates `req.user.isAdmin`; we just gate on it.
 *
 * Used by all `/api/v1/users/*` endpoints (per auth matrix in
 * `phase_08_backend_plan.md` §4.0).
 */

import type { NextFunction, Request, Response } from "express";
import { ForbiddenError, TokenInvalidError } from "../shared/errors";

export function requireAdmin() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      // requireAuth must run before this; absent user is a wiring bug.
      next(new TokenInvalidError());
      return;
    }
    if (!req.user.isAdmin) {
      next(new ForbiddenError("Admin role required."));
      return;
    }
    next();
  };
}
