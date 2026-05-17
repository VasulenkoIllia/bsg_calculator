/**
 * Zod schemas for the HubSpot webhook event payload.
 *
 * HubSpot delivers events as a JSON array — even single events arrive
 * wrapped in `[ { ... } ]`. The receiver fans the array out into
 * individual `hubspot_webhook_events` rows.
 *
 * Reference: https://developers.hubspot.com/docs/api/webhooks
 */

import { z } from "zod";

/**
 * The six event types we explicitly handle. Anything outside this
 * enum is dropped at receive time with a log warning (a HubSpot
 * subscription change shouldn't be silently absorbed — operators
 * need to see "we got X but don't process it").
 */
export const SUPPORTED_SUBSCRIPTION_TYPES = [
  "company.creation",
  "company.propertyChange",
  "company.deletion",
  "deal.creation",
  "deal.propertyChange",
  "deal.deletion"
] as const;

export const subscriptionTypeSchema = z.enum(SUPPORTED_SUBSCRIPTION_TYPES);
export type SubscriptionType = z.infer<typeof subscriptionTypeSchema>;

/**
 * Single event entry. HubSpot's payload has additional fields we
 * don't care about (e.g. `attemptNumber`, `portalId`, `appId`) —
 * `.passthrough()` keeps them in the raw JSONB without forcing us
 * to model every shape.
 */
export const webhookEventSchema = z
  .object({
    eventId: z.union([z.string(), z.number()]).transform(v => String(v)),
    subscriptionType: subscriptionTypeSchema,
    // `objectId` is a HubSpot id — sometimes number, sometimes string.
    // Coerce to string for storage / comparison.
    objectId: z.union([z.string(), z.number()]).transform(v => String(v)),
    occurredAt: z.number().int().positive() // epoch ms
  })
  .passthrough();

export type WebhookEvent = z.infer<typeof webhookEventSchema>;

/**
 * HubSpot sends events as an array. Empty arrays are rejected
 * (would indicate a misconfigured test ping).
 */
export const webhookBodySchema = z.array(webhookEventSchema).min(1);
export type WebhookBody = z.infer<typeof webhookBodySchema>;
