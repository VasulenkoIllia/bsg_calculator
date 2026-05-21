/**
 * Sprint 9.L D6 — hierarchical role tier helper (frontend).
 *
 * Mirrors `server/shared/roles.ts → ROLE_TIER` so the frontend and
 * backend agree on what "≥ admin" means.
 *
 * The canonical UserRole UNION lives in `src/api/types.ts` (it's the
 * shape returned by `GET /auth/me`). This module only owns the
 * tier-comparison helper so route/middleware code doesn't keep
 * re-encoding the order inline.
 *
 * Why two copies (FE + BE)? Vite and tsx don't share a bundle; the
 * frontend tree (`src/`) and the backend tree (`server/`) are separate
 * tsc projects. The literals are intentionally short and unlikely to
 * drift, but the deliberate mirroring is documented at the top of
 * each file so a future refactor that adds a fourth role updates
 * both.
 */

import type { UserRole } from "../api/types.js";

/**
 * Map each role to a numeric tier so hierarchical comparisons stay
 * a single `>=`. Mirrors `server/shared/roles.ts → ROLE_TIER`.
 */
export const ROLE_TIER: Record<UserRole, number> = {
  user: 0,
  admin: 1,
  super_admin: 2
};

/**
 * Returns true when `actor` has at LEAST `min`'s capabilities.
 * Useful in render-time gates (e.g. `hasRoleAtLeast(user.role, 'admin')`
 * for an Admin-only button).
 */
export function hasRoleAtLeast(actor: UserRole, min: UserRole): boolean {
  return ROLE_TIER[actor] >= ROLE_TIER[min];
}
