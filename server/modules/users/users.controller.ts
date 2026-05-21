/**
 * Users HTTP controllers — thin request/response adapters.
 */

import type { Request, Response } from "express";
import { parseUuidParam } from "../../shared/uuid-param";
import { InternalError } from "../../shared/errors";
import {
  createUser,
  getUser,
  getUsers,
  patchUser,
  resetUserPassword
} from "./users.service";
import {
  createUserRequestSchema,
  resetPasswordRequestSchema,
  updateUserRequestSchema
} from "./users.schemas";

/**
 * Phase 8 Stage 3 — read the authenticated actor's id from `req.user`.
 * requireAuth() attached it; absent means the middleware stack is
 * mis-wired (route reached without going through requireAuth first).
 * We surface this as 500 so it shows up loud in logs.
 */
function actorId(req: Request): string {
  const id = req.user?.id;
  if (!id) {
    throw new InternalError(
      "[users.controller] req.user.id missing — requireAuth() not mounted before this handler"
    );
  }
  return id;
}

export async function listController(_req: Request, res: Response): Promise<void> {
  const users = await getUsers();
  res.status(200).json({ items: users });
}

export async function getController(req: Request, res: Response): Promise<void> {
  const id = parseUuidParam(req, "id");
  const user = await getUser(id);
  res.status(200).json(user);
}

export async function createController(req: Request, res: Response): Promise<void> {
  const body = createUserRequestSchema.parse(req.body);
  const user = await createUser(body);
  res.status(201).json(user);
}

export async function patchController(req: Request, res: Response): Promise<void> {
  const id = parseUuidParam(req, "id");
  const body = updateUserRequestSchema.parse(req.body);
  const user = await patchUser(id, body, actorId(req));
  res.status(200).json(user);
}

export async function resetPasswordController(req: Request, res: Response): Promise<void> {
  const id = parseUuidParam(req, "id");
  const body = resetPasswordRequestSchema.parse(req.body);
  const user = await resetUserPassword(id, body.newPassword);
  res.status(200).json(user);
}
