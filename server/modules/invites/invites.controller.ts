/**
 * Sprint 9.O — invite-link HTTP controllers.
 *
 * Auth split:
 *   - POST/GET/DELETE under /users/invites — super_admin only (gated
 *     at the router; controllers assume req.user is set).
 *   - GET/POST under /auth/invite — PUBLIC (no requireAuth). The raw
 *     token IS the credential. Token verification happens in the
 *     repository's `findAliveInviteByRawToken` (404 on any miss).
 */

import type { Request, Response } from "express";
import { REFRESH_COOKIE_NAME, refreshCookieOptions } from "../auth/auth.cookies";
import { parseUuidParam } from "../../shared/uuid-param";
import { InternalError } from "../../shared/errors";
import { recordAdminAction } from "../admin-actions/admin-actions.service";
import {
  acceptInviteRequestSchema,
  createInviteRequestSchema
} from "./invites.schemas";
import {
  acceptInvite,
  createInviteAndLink,
  listInvites,
  previewInvite,
  revokeInviteById
} from "./invites.service";

function actorId(req: Request): string {
  const id = req.user?.id;
  if (!id) {
    throw new InternalError(
      "[invites.controller] req.user.id missing — requireAuth not mounted"
    );
  }
  return id;
}

// ─── super_admin endpoints ──────────────────────────────────────────

export async function createInviteController(req: Request, res: Response): Promise<void> {
  const body = createInviteRequestSchema.parse(req.body);
  const result = await createInviteAndLink(body, actorId(req));
  await recordAdminAction({
    actorUserId: actorId(req),
    actionType: "user.invite_created",
    targetType: "invite",
    targetId: result.id,
    meta: { role: body.role, expiresAt: result.expiresAt }
  });
  res.status(201).json(result);
}

export async function listInvitesController(_req: Request, res: Response): Promise<void> {
  const items = await listInvites();
  res.status(200).json({ items });
}

export async function revokeInviteController(req: Request, res: Response): Promise<void> {
  const id = parseUuidParam(req, "id");
  await revokeInviteById(id);
  await recordAdminAction({
    actorUserId: actorId(req),
    actionType: "user.invite_revoked",
    targetType: "invite",
    targetId: id
  });
  res.status(204).end();
}

// ─── Public endpoints (no auth) ─────────────────────────────────────

function readRawToken(req: Request): string {
  // Token comes via path param (per the link format
  // /accept-invite?token=… on the FE; backend receives via
  // /auth/invite/:token). Trim + length guard for sanity.
  const raw = req.params.token ?? "";
  return raw.trim().slice(0, 256);
}

export async function previewInviteController(req: Request, res: Response): Promise<void> {
  const preview = await previewInvite(readRawToken(req));
  res.status(200).json(preview);
}

export async function acceptInviteController(req: Request, res: Response): Promise<void> {
  const body = acceptInviteRequestSchema.parse(req.body);
  const result = await acceptInvite(readRawToken(req), body);

  // Audit log — the newly-created user IS the actor. The invite
  // creator is captured separately on `user_invites.created_by_user_id`
  // (and surfaces on the InvitesPanel "Created by" column).
  await recordAdminAction({
    actorUserId: result.user.id,
    actionType: "auth.invite_accepted",
    targetType: "user",
    targetId: result.user.id,
    meta: { role: result.user.role, email: result.user.email }
  });

  // Mirror /auth/login: refresh token lives in httpOnly cookie,
  // access token + public user shape in the body. FE drops them
  // into AuthContext + the cookie carries the refresh side
  // transparently.
  res.cookie(REFRESH_COOKIE_NAME, result.refreshTokenRaw, refreshCookieOptions);
  res.status(201).json({
    accessToken: result.accessToken,
    user: result.user
  });
}
