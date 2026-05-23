/**
 * Sprint 9.V audit fix M1 — shared helper for extracting the
 * denormalised actor identity that `recordAdminAction` accepts.
 *
 * Every authenticated controller that writes an audit entry passes
 * the same three fields (id + displayName + email) from `req.user`.
 * Centralising the extraction here saves the duplication AND
 * surfaces the "must run after requireAuth" invariant in one place.
 *
 * Usage:
 *   await recordAdminAction({
 *     ...auditActor(req),
 *     actionType: "...",
 *     targetType: "...",
 *     targetId: "..."
 *   });
 */

import type { Request } from "express";
import { InternalError } from "./errors";

export function auditActor(req: Request): {
  actorUserId: string;
  actorDisplayName: string;
  actorEmail: string;
} {
  if (!req.user) {
    throw new InternalError(
      "[auditActor] req.user missing — requireAuth not mounted before this handler"
    );
  }
  return {
    actorUserId: req.user.id,
    actorDisplayName: req.user.displayName,
    actorEmail: req.user.email
  };
}
