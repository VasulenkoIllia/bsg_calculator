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

/**
 * Events we act on, in CANONICAL form. Anything else is ACKed and ignored.
 *
 * These are the names the `create_webhook` mutation accepts. monday does
 * NOT send them back: the delivered payload's `type` uses a different,
 * older vocabulary — `create_item` arrives as `create_pulse`, `change_name`
 * as `update_name`, `change_column_value` as `update_column_value`.
 * Verified on live deliveries 2026-08-28, and confirmed by monday's own
 * docs for the two they publish samples for.
 *
 * That mismatch silently dropped EVERY event: the endpoint answered 200,
 * the log said "not subscribed", the queue stayed empty, and the whole
 * integration looked healthy while syncing nothing. `normaliseEventType`
 * below exists so the inbound vocabulary can never diverge from this list
 * again.
 */
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

/**
 * Delivered `type` -> canonical event.
 *
 * Deliberately generous: an alias that never arrives costs nothing, while
 * a missing one drops data silently. Both spellings of every event are
 * listed, so this keeps working whichever vocabulary monday sends.
 *
 * The `_pulse` forms are monday's legacy internal name for an item.
 */
const EVENT_ALIASES: Record<string, (typeof SUPPORTED_EVENTS)[number]> = {
  // observed live, 2026-08-28
  create_pulse: "create_item",
  update_name: "change_name",
  update_column_value: "change_column_value",
  // documented / legacy spellings for the rest
  delete_pulse: "item_deleted",
  archive_pulse: "item_archived",
  restore_pulse: "item_restored",
  unarchive_pulse: "item_restored",
  move_pulse_into_group: "item_moved_to_any_group",
  move_pulse_into_board: "item_moved_to_any_group",
  update_pulse_group: "item_moved_to_any_group",
  // status changes arrive as a column update
  change_status_column_value: "change_column_value",
  change_specific_column_value: "change_column_value"
};

/**
 * Map whatever monday sent onto one of SUPPORTED_EVENTS, or null when we
 * genuinely do not handle it. Canonical names pass through unchanged, so
 * this is safe if monday ever aligns the two vocabularies.
 */
export function normaliseEventType(raw: string): (typeof SUPPORTED_EVENTS)[number] | null {
  if ((SUPPORTED_EVENTS as readonly string[]).includes(raw)) {
    return raw as (typeof SUPPORTED_EVENTS)[number];
  }
  return EVENT_ALIASES[raw] ?? null;
}

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
