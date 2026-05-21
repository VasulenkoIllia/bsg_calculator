/**
 * Users module — business logic for admin user management.
 *
 * Phase 8 surface (per auth matrix):
 *   listUsers() → User[]
 *   getUser(id) → User | NotFoundError
 *   createUser(input) → User | ConflictError
 *   updateUser(id, patch) → User | NotFoundError
 *   resetPassword(id, newPassword) → User | NotFoundError
 *
 * All callers must be authenticated admins (gated by `requireAdmin()`
 * in the route layer).
 */

import bcrypt from "bcrypt";
import { env } from "../../config/env";
import {
  ConflictError,
  NotFoundError,
  UnprocessableError
} from "../../shared/errors";
import {
  countActiveUsersByRoleExcluding,
  emailOrLoginExists,
  findUserById,
  insertUser,
  listUsers,
  updatePasswordHash,
  updateUser as updateUserRow
} from "./users.repository";
import type {
  CreateUserRequest,
  UpdateUserRequest,
  UserPublic
} from "./users.schemas";
import type { User } from "../../db/schema";

function toPublic(user: User): UserPublic {
  return {
    id: user.id,
    email: user.email,
    login: user.login,
    displayName: user.displayName,
    // Phase 8 Stage 1: `role` enum replaces the boolean `isAdmin`.
    role: user.role,
    isActive: user.isActive
  };
}

export async function getUsers(): Promise<UserPublic[]> {
  const rows = await listUsers();
  return rows.map(toPublic);
}

export async function getUser(id: string): Promise<UserPublic> {
  const row = await findUserById(id);
  if (!row) throw new NotFoundError("User");
  return toPublic(row);
}

export async function createUser(input: CreateUserRequest): Promise<UserPublic> {
  const login = input.login ?? null;

  if (await emailOrLoginExists(input.email, login)) {
    throw new ConflictError(
      "CONFLICT_USER_EXISTS",
      "A user with this email or login already exists."
    );
  }

  const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_COST);
  const row = await insertUser({
    email: input.email,
    login,
    passwordHash,
    displayName: input.displayName,
    role: input.role
  });
  return toPublic(row);
}

/**
 * Phase 8 Stage 3 — PATCH a user with three lock-out guards:
 *
 *   1. Self-block: an actor cannot set their OWN `isActive=false`.
 *      A super_admin who clicked "block" on themself would be
 *      unable to log back in to undo the change — there's no
 *      higher-tier user who could reach the row.
 *   2. Self-downgrade: an actor cannot change their OWN role to
 *      anything lower. (The capability matrix only allows
 *      super_admin to call this endpoint, so the only meaningful
 *      transition is super_admin → admin/user — which would
 *      immediately fail authorization on the very next request.)
 *   3. Last-super_admin: if the target IS a super_admin AND the
 *      patch would demote (role → not super_admin) OR block
 *      (isActive → false), we require at least one OTHER active
 *      super_admin to remain so the admin surface stays reachable.
 *
 * All three guards return `422 UNPROCESSABLE` with a stable code
 * the FE keys off to render the inline form error.
 */
export async function patchUser(
  id: string,
  patch: UpdateUserRequest,
  actorUserId: string
): Promise<UserPublic> {
  // We need the current row for two checks below (target role
  // before the patch + whether `id === actorUserId`). One read up
  // front beats branching on each field.
  const current = await findUserById(id);
  if (!current) throw new NotFoundError("User");

  const isSelfEdit = current.id === actorUserId;

  // Guard 1: self-block.
  if (isSelfEdit && patch.isActive === false) {
    throw new UnprocessableError(
      "USER_CANNOT_SELF_BLOCK",
      "You cannot block your own account. Ask another super-admin to do it."
    );
  }

  // Guard 2: self-downgrade.
  if (
    isSelfEdit &&
    patch.role !== undefined &&
    patch.role !== current.role
  ) {
    throw new UnprocessableError(
      "USER_CANNOT_SELF_DOWNGRADE",
      "You cannot change your own role. Ask another super-admin to do it."
    );
  }

  // Guard 3: last-super_admin survival.
  // Triggers when target IS currently super_admin AND the patch
  // would either demote or block them. Counts OTHER super_admins
  // who are still active — if zero remain after the change, reject.
  const willDemote =
    current.role === "super_admin" &&
    patch.role !== undefined &&
    patch.role !== "super_admin";
  const willBlock =
    current.role === "super_admin" && patch.isActive === false;
  if (willDemote || willBlock) {
    const otherActive = await countActiveUsersByRoleExcluding(
      "super_admin",
      current.id
    );
    if (otherActive === 0) {
      throw new UnprocessableError(
        "LAST_SUPER_ADMIN",
        "Cannot demote or block the last active super-admin. Promote another user first."
      );
    }
  }

  const row = await updateUserRow(id, patch);
  if (!row) throw new NotFoundError("User");
  return toPublic(row);
}

export async function resetUserPassword(
  id: string,
  newPassword: string
): Promise<UserPublic> {
  const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_COST);
  const row = await updatePasswordHash(id, passwordHash);
  if (!row) throw new NotFoundError("User");
  return toPublic(row);
}
