/**
 * Users HTTP controllers — thin request/response adapters.
 */

import type { Request, Response } from "express";
import { parseUuidParam } from "../../shared/uuid-param";
import { InternalError } from "../../shared/errors";
import { recordAdminAction } from "../admin-actions/admin-actions.service";
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
  await recordAdminAction({
    actorUserId: actorId(req),
    actionType: "user.created",
    targetType: "user",
    targetId: user.id,
    meta: { email: user.email, role: user.role }
  });
  res.status(201).json(user);
}

export async function patchController(req: Request, res: Response): Promise<void> {
  const id = parseUuidParam(req, "id");
  const body = updateUserRequestSchema.parse(req.body);
  const user = await patchUser(id, body, actorId(req));
  await recordAdminAction({
    actorUserId: actorId(req),
    actionType: "user.updated",
    targetType: "user",
    targetId: user.id,
    // `body` is the diff actually sent — captures whatever the
    // super_admin changed (role / displayName / isActive). Note
    // it does NOT carry the new password (that's a separate
    // endpoint with its own audit event).
    meta: { changes: body }
  });
  res.status(200).json(user);
}

export async function resetPasswordController(req: Request, res: Response): Promise<void> {
  const id = parseUuidParam(req, "id");
  const body = resetPasswordRequestSchema.parse(req.body);
  const user = await resetUserPassword(id, body.newPassword);
  await recordAdminAction({
    actorUserId: actorId(req),
    actionType: "user.password_reset",
    targetType: "user",
    targetId: id
    // NEVER log the new password value — even in meta. The audit
    // entry just records "reset happened for user X by Y at time T".
  });
  res.status(200).json(user);
}
