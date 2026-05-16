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
import { ConflictError, NotFoundError } from "../../shared/errors";
import {
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
    isAdmin: user.isAdmin,
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
    isAdmin: input.isAdmin
  });
  return toPublic(row);
}

export async function patchUser(id: string, patch: UpdateUserRequest): Promise<UserPublic> {
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
