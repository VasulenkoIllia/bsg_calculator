/**
 * monday webhook receiver.
 *
 * Answers in two shapes:
 *   - the registration handshake: echo `{ challenge }` verbatim;
 *   - an event: queue it and ACK 200 immediately.
 *
 * Nothing is processed inline. monday retries every minute for 30
 * minutes on a non-2xx, so a slow handler turns one change into thirty
 * deliveries.
 */

import crypto from "node:crypto";
import type { Request, Response } from "express";
import { logger } from "../../../middleware/logger";
import { env } from "../../../config/env";
import { insertMondayEventIfNew } from "./webhooks.repository";
import {
  challengeSchema,
  eventItemId,
  occurredAt,
  stableTriggerStamp,
  SUPPORTED_EVENTS,
  webhookBodySchema
} from "./webhooks.schemas";

/** Which of our object kinds a board id represents. */
function objectTypeForBoard(boardId: string): "company" | "agent" | "deal" | null {
  if (boardId === env.MONDAY_BOARD_COMPANIES) return "company";
  if (boardId === env.MONDAY_BOARD_AGENTS) return "agent";
  if (boardId === env.MONDAY_BOARD_DEALS) return "deal";
  return null;
}

/**
 * Synthesise the idempotency key. monday sends no delivery-unique id, so
 * without this the 30 retries of a single change would queue 30 rows.
 */
function eventKey(parts: {
  boardId: string;
  itemId: string;
  type: string;
  stamp: string | null;
  raw: unknown;
}): string {
  // When monday gives us no usable timestamp, hash the RAW BODY instead of
  // reaching for now(): a wall-clock component differs on every one of the
  // 30 retries, so the dedupe it exists to provide would silently stop
  // working exactly when it is needed.
  const discriminator = parts.stamp ?? `body:${crypto.createHash("md5").update(JSON.stringify(parts.raw)).digest("hex")}`;
  return crypto
    .createHash("md5")
    .update(`${parts.boardId}:${parts.itemId}:${parts.type}:${discriminator}`)
    .digest("hex");
}

export async function mondayWebhookController(req: Request, res: Response): Promise<void> {
  // 1. Handshake FIRST. monday sends this when the webhook is created and
  //    will refuse to register the endpoint unless the value comes back.
  const challenge = challengeSchema.safeParse(req.body);
  if (challenge.success) {
    logger.info("[monday:webhook] challenge received — echoing it back");
    res.status(200).json({ challenge: challenge.data.challenge });
    return;
  }

  const parsed = webhookBodySchema.safeParse(req.body);
  if (!parsed.success) {
    // ACK anyway: a 4xx would make monday retry this same unparseable
    // body 30 times. Log it so a payload change is visible.
    logger.warn(
      { issues: parsed.error.issues.slice(0, 3) },
      "[monday:webhook] unrecognised payload — acking and skipping"
    );
    res.status(200).json({ accepted: 0, malformed: true });
    return;
  }

  const event = parsed.data.event;
  const itemId = eventItemId(event);
  const objectType = objectTypeForBoard(event.boardId);

  if (!itemId || !objectType) {
    logger.warn(
      { boardId: event.boardId, type: event.type, itemId },
      "[monday:webhook] event from an unknown board or without an item id — skipping"
    );
    res.status(200).json({ accepted: 0, skipped: true });
    return;
  }

  if (!SUPPORTED_EVENTS.includes(event.type as (typeof SUPPORTED_EVENTS)[number])) {
    logger.info({ type: event.type }, "[monday:webhook] event type not subscribed — skipping");
    res.status(200).json({ accepted: 0, skipped: true });
    return;
  }

  const at = occurredAt(event);
  const stamp = stableTriggerStamp(event);
  if (!stamp) {
    logger.warn(
      { type: event.type, itemId },
      "[monday:webhook] event carries no parseable triggerTime — deduplicating on the body hash instead"
    );
  }
  const inserted = await insertMondayEventIfNew({
    eventKey: eventKey({
      boardId: event.boardId,
      itemId,
      type: event.type,
      stamp,
      raw: parsed.data
    }),
    eventType: event.type,
    boardId: event.boardId,
    itemId,
    objectType,
    occurredAt: at,
    raw: parsed.data
  });

  logger.info(
    { type: event.type, objectType, itemId, deduped: !inserted },
    "[monday:webhook] event queued"
  );
  res.status(200).json({ accepted: inserted ? 1 : 0, deduped: !inserted });
}
