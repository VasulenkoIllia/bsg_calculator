/**
 * Admin-only middleware — Phase 8 Stage 1 backward-compat shim.
 *
 * Pre-Stage-1 this file held the actual gate logic and branched on
 * `req.user.isAdmin`. Stage 1 introduced a hierarchical role enum
 * (`user` ⊂ `admin` ⊂ `super_admin`) and a generic `requireRole(min)`
 * middleware; `requireAdmin()` is now just `requireRole('admin')`.
 *
 * New code SHOULD import `requireRole` directly. This re-export
 * keeps existing route files that import `requireAdmin` working
 * without a churning rename in the same commit.
 */

import { requireRole } from "./require-role";

export function requireAdmin() {
  return requireRole("admin");
}
