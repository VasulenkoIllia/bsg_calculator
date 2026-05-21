/**
 * Generic role-gate middleware — Phase 8 Stage 1.
 *
 * Hierarchical: `requireRole('admin')` accepts both `admin` and
 * `super_admin`. `requireRole('user')` accepts everyone authenticated.
 *
 * Replaces the Phase-8-pre-Stage-1 `requireAdmin()` middleware,
 * which is now a thin re-export of `requireRole('admin')` kept
 * for backwards-compat in places that haven't been touched yet.
 *
 * Auth matrix:
 *   - Read endpoints (companies, deals, documents, calc-configs):
 *     `requireRole('user')` (any authenticated)
 *   - Write endpoints that admin owns (e.g. document delete in
 *     Stage 5): `requireRole('admin')`
 *   - Super-admin-only (user management, audit log, doc restore in
 *     Stages 3/5/6): `requireRole('super_admin')`
 */

import type { NextFunction, Request, Response } from "express";
import { USER_ROLES, type UserRole } from "../db/schema";
import { ForbiddenError, TokenInvalidError } from "../shared/errors";

/**
 * Map each role to a numeric tier so hierarchical comparisons stay
 * a single `>=` rather than a chain of equality checks. New roles
 * just slot into this table; the rest of the gate logic is unchanged.
 */
const ROLE_TIER: Record<UserRole, number> = {
  user: 0,
  admin: 1,
  super_admin: 2
};

export function requireRole(min: UserRole) {
  // Validate at module-load time so a typo in `requireRole('SuperAdmin')`
  // crashes at boot rather than silently allowing all callers through.
  if (!USER_ROLES.includes(min)) {
    throw new Error(
      `[requireRole] unknown role '${min}'. Allowed: ${USER_ROLES.join(", ")}`
    );
  }
  const minTier = ROLE_TIER[min];

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      // requireAuth must run before this; absent user is a wiring bug.
      next(new TokenInvalidError());
      return;
    }
    const actorTier = ROLE_TIER[req.user.role];
    if (actorTier < minTier) {
      next(
        new ForbiddenError(
          `${min === "admin" ? "Admin" : "Super-admin"} role required.`
        )
      );
      return;
    }
    next();
  };
}
