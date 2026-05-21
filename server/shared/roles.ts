/**
 * Sprint 9.L D6 — hierarchical role tier helper.
 *
 * Was previously inlined in `middleware/require-role.ts` AND (a
 * parallel copy) in `src/contexts/AuthContext.tsx`. Both copies
 * encode the same `user(0) ⊂ admin(1) ⊂ super_admin(2)` ordering,
 * but the two literals could drift independently if a new role
 * were added.
 *
 * The hand-mirrored definitions remain (this file on the server,
 * `src/shared/roles.ts` on the frontend) because Vite and tsx don't
 * share a single bundle — but each side now imports from its own
 * `shared/roles.ts`, so the inline literals no longer live inside
 * application code where they're easy to miss.
 *
 * NOTE: the canonical USER_ROLES tuple stays in `db/schema/users.ts`
 * because the Drizzle schema needs it for the CHECK constraint.
 * This module re-exports the same type to keep callers honest.
 */

import { USER_ROLES, type UserRole } from "../db/schema";

export { USER_ROLES };
export type { UserRole };

/**
 * Map each role to a numeric tier so hierarchical comparisons stay
 * a single `>=` rather than a chain of equality checks. New roles
 * just slot into this table; the rest of the gate logic is unchanged.
 *
 * Mirrors `src/shared/roles.ts → ROLE_TIER` on the frontend.
 */
export const ROLE_TIER: Record<UserRole, number> = {
  user: 0,
  admin: 1,
  super_admin: 2
};

/**
 * Returns true when `actor` has at LEAST `min`'s capabilities.
 *
 *   hasRoleAtLeast("super_admin", "admin") === true
 *   hasRoleAtLeast("admin",       "admin") === true
 *   hasRoleAtLeast("user",        "admin") === false
 */
export function hasRoleAtLeast(actor: UserRole, min: UserRole): boolean {
  return ROLE_TIER[actor] >= ROLE_TIER[min];
}
