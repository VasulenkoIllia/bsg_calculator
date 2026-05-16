/**
 * Users HTTP controllers — thin request/response adapters.
 */

import type { Request, Response } from "express";
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

export async function listController(_req: Request, res: Response): Promise<void> {
  const users = await getUsers();
  res.status(200).json({ items: users });
}

export async function getController(req: Request, res: Response): Promise<void> {
  const user = await getUser(req.params.id);
  res.status(200).json(user);
}

export async function createController(req: Request, res: Response): Promise<void> {
  const body = createUserRequestSchema.parse(req.body);
  const user = await createUser(body);
  res.status(201).json(user);
}

export async function patchController(req: Request, res: Response): Promise<void> {
  const body = updateUserRequestSchema.parse(req.body);
  const user = await patchUser(req.params.id, body);
  res.status(200).json(user);
}

export async function resetPasswordController(req: Request, res: Response): Promise<void> {
  const body = resetPasswordRequestSchema.parse(req.body);
  const user = await resetUserPassword(req.params.id, body.newPassword);
  res.status(200).json(user);
}
