/**
 * Sprint 9.O — password-reset-link HTTP controllers.
 *
 * Two surfaces:
 *   - `createPasswordResetLinkController` — mounted under
 *     `/api/v1/users/:id/password-reset-link` (super_admin only).
 *   - public preview + consume — mounted under
 *     `/api/v1/auth/password-reset/:token`.
 */

import type { Request, Response } from "express";
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from "../auth/auth.cookies";
import { parseUuidParam } from "../../shared/uuid-param";
import { InternalError } from "../../shared/errors";
import { auditActor } from "../../shared/audit-actor";
import { recordAdminAction } from "../admin-actions/admin-actions.service";
import { consumeResetRequestSchema } from "./resets.schemas";
import { consumeReset, createResetLink, previewReset } from "./resets.service";

function actorId(req: Request): string {
  const id = req.user?.id;
  if (!id) {
    throw new InternalError(
      "[resets.controller] req.user.id missing — requireAuth not mounted"
    );
  }
  return id;
}

export async function createPasswordResetLinkController(
  req: Request,
  res: Response
): Promise<void> {
  const actor = actorId(req);
  const userId = parseUuidParam(req, "id");
  const result = await createResetLink(userId, actor);
  await recordAdminAction({
    ...auditActor(req),
    actionType: "user.reset_link_created",
    targetType: "user",
    targetId: userId,
    meta: { resetId: result.id, expiresAt: result.expiresAt }
  });
  res.status(201).json(result);
}

function readRawToken(req: Request): string {
  const raw = req.params.token ?? "";
  return raw.trim().slice(0, 256);
}

export async function previewResetController(req: Request, res: Response): Promise<void> {
  const preview = await previewReset(readRawToken(req));
  res.status(200).json(preview);
}

export async function consumeResetController(req: Request, res: Response): Promise<void> {
  const body = consumeResetRequestSchema.parse(req.body);
  const result = await consumeReset(readRawToken(req), body.newPassword);
  // Audit log — actor is the user whose password was just reset.
  // Public endpoint — no req.user; pass denormalised fields from the
  // freshly-loaded user explicitly.
  await recordAdminAction({
    actorUserId: result.user.id,
    actorDisplayName: result.user.displayName,
    actorEmail: result.user.email,
    actionType: "auth.reset_consumed",
    targetType: "user",
    targetId: result.user.id
  });
  res.cookie(REFRESH_COOKIE_NAME, result.refreshTokenRaw, refreshCookieOptions);
  res.status(200).json({
    accessToken: result.accessToken,
    user: result.user
  });
}
