/**
 * monday webhook routes — mounted at /api/v1/monday.
 *
 * `POST /webhooks/:secret` is public by necessity: monday cannot carry a
 * Bearer token, and webhooks it creates with a personal token are NOT
 * signed (JWT signing exists only for registered monday apps). The
 * authentication is therefore two-part, and the second half is the one
 * that actually matters:
 *
 *   1. an unguessable path segment (`MONDAY_WEBHOOK_SECRET`), compared in
 *      constant time so a wrong guess leaks nothing through timing;
 *   2. the payload is treated as a TRIGGER ONLY — the processor re-reads
 *      every field from the API with our own token. A forged request can
 *      at worst cause one wasted read; it cannot write anything.
 *
 * The challenge handshake is answered by the controller BEFORE any event
 * handling, because monday will not register an endpoint that fails it.
 */

import crypto from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { env } from "../../../config/env";
import { logger } from "../../../middleware/logger";
import { webhookLimiter } from "../../../middleware/rate-limit";
import { ForbiddenError, NotFoundError } from "../../../shared/errors";
import { asyncHandler } from "../../../shared/async-handler";
import { mondayWebhookController } from "./webhooks.controller";

export const mondayWebhooksRouter = Router();

function verifySecret(req: Request, _res: Response, next: NextFunction): void {
  const expected = env.MONDAY_WEBHOOK_SECRET ?? "";
  if (expected.length === 0) {
    // Not configured = the endpoint does not exist. A 404 rather than a
    // 403 so an unconfigured deployment reveals nothing about the route.
    throw new NotFoundError("Route");
  }
  const provided = req.params.secret ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!ok) {
    logger.warn({ len: provided.length }, "[monday:webhook] wrong secret in path — rejecting");
    throw new ForbiddenError("Invalid webhook path.");
  }
  next();
}

/**
 * The secret lives in the PATH, and the HTTP logger records the URL of
 * every request — so without this the endpoint's only credential is
 * written to the log file on every delivery, and to stdout in a container
 * whose logs anyone with docker access can read. Overwrite the logged URL
 * before the logger ever sees it; routing has already happened, so the
 * mutation is invisible to the handler.
 */
function redactSecretFromLogs(req: Request, _res: Response, next: NextFunction): void {
  const masked = req.originalUrl.replace(/\/webhooks\/[^/?]+/, "/webhooks/***");
  Object.defineProperty(req, "originalUrl", { value: masked, configurable: true });
  Object.defineProperty(req, "url", { value: masked.replace("/api/v1/monday", ""), configurable: true });
  next();
}

mondayWebhooksRouter.post(
  "/webhooks/:secret",
  redactSecretFromLogs,
  verifySecret,
  webhookLimiter,
  asyncHandler(mondayWebhookController)
);
