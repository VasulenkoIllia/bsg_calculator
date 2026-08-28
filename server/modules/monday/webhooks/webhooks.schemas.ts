/**
 * monday webhook payload shapes.
 *
 * Two things to know before reading:
 *
 * 1. **The challenge comes first.** When a webhook is registered, monday
 *    POSTs `{"challenge": "<token>"}` and expects the same value echoed
 *    back as JSON. That handshake must be answered BEFORE any event
 *    validation, or the webhook can never be created in the first place.
 *
 * 2. **The payload is a trigger, not data.** Every field the processor
 *    acts on is re-read from the API with our own token. So this schema
 *    only needs to be strict enough to identify WHICH item changed —
 *    which is also why an unsigned webhook (monday does not sign
 *    personal-token webhooks) is an acceptable risk: a forged POST can at
 *    worst cost us one wasted read.
 */

import { z } from "zod";

export const challengeSchema = z.object({ challenge: z.string().min(1) });

/** Events we subscribe to. Anything else is ACKed and ignored. */
export const SUPPORTED_EVENTS = [
  "create_item",
  "change_column_value",
  "change_name",
  "item_deleted",
  "item_archived",
  "item_restored",
  "move_item_to_group",
  "item_moved_to_any_group"
] as const;

const numericish = z.union([z.string(), z.number()]).transform(v => String(v));

/**
 * `.passthrough()` on purpose: monday adds fields freely, and an
 * unmodelled one must never drop a delivery. The strictness that matters
 * is on the three identifying fields.
 */
export const mondayEventSchema = z
  .object({
    type: z.string(),
    boardId: numericish,
    pulseId: numericish.optional(),
    itemId: numericish.optional(),
    // Epoch MICROseconds in monday's payloads — note the divisor in
    // `occurredAt()` below, which is easy to get wrong by 1000x.
    triggerTime: z.union([z.string(), z.number()]).optional(),
    userId: numericish.optional()
  })
  .passthrough();

export const webhookBodySchema = z.object({ event: mondayEventSchema }).passthrough();

export type MondayEvent = z.infer<typeof mondayEventSchema>;

/** The item id, whichever field this particular event type used. */
export function eventItemId(event: MondayEvent): string | null {
  return event.pulseId ?? event.itemId ?? null;
}

/**
 * monday's `triggerTime` is an ISO string on some events and epoch
 * microseconds on others. Both are handled; anything unparseable falls
 * back to now(), because a slightly-wrong timestamp is only a queue
 * ordering detail — the processor re-reads current state regardless.
 */
/**
 * A STABLE component for the idempotency key, or null when the payload
 * carries no usable timestamp.
 *
 * Distinct from `occurredAt()` below, which falls back to now() — fine for
 * queue ordering, fatal for deduplication: monday redelivers the identical
 * body every minute for 30 minutes, so a now()-derived key would be
 * different on every retry and one change would queue thirty rows.
 */
export function stableTriggerStamp(event: MondayEvent): string | null {
  const raw = event.triggerTime;
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? String(raw) : null;
  const asNumber = Number(raw);
  if (Number.isFinite(asNumber) && String(raw).trim() !== "") return String(asNumber);
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : String(parsed);
}

export function occurredAt(event: MondayEvent): Date {
  const raw = event.triggerTime;
  if (raw === undefined || raw === null) return new Date();
  if (typeof raw === "number") {
    const ms = raw > 1e14 ? raw / 1000 : raw;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? new Date() : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
