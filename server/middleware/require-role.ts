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
import { ForbiddenError, TokenInvalidError } from "../shared/errors";
// Sprint 9.L D6 — ROLE_TIER + USER_ROLES now live in shared/roles.ts
// so the middleware and the frontend's AuthContext.hasRole both pull
// from a named helper instead of inlining the literal table.
import { USER_ROLES, hasRoleAtLeast, type UserRole } from "../shared/roles";

export function requireRole(min: UserRole) {
  // Validate at module-load time so a typo in `requireRole('SuperAdmin')`
  // crashes at boot rather than silently allowing all callers through.
  if (!USER_ROLES.includes(min)) {
    throw new Error(
      `[requireRole] unknown role '${min}'. Allowed: ${USER_ROLES.join(", ")}`
    );
  }

  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      // requireAuth must run before this; absent user is a wiring bug.
      next(new TokenInvalidError());
      return;
    }
    if (!hasRoleAtLeast(req.user.role, min)) {
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
