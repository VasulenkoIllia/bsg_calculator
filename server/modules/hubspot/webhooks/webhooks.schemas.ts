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
 *
 * Sprint 5.F.2: `objectId` and `eventId` are now constrained to
 * numeric strings (1–19 digits). HubSpot only ever sends numeric
 * ids in either form (string or number). The strict validation is
 * defence-in-depth against future processor code that builds upstream
 * URLs from `objectId` — a non-numeric value would surface as a
 * malformed payload (200 ack + drop) instead of slipping through to
 * a hubspot.getCompany(...) call with a path segment we never expected.
 */
const NUMERIC_ID = /^\d{1,19}$/;
const numericIdField = z
  .union([z.string(), z.number()])
  .transform(v => String(v))
  .refine(v => NUMERIC_ID.test(v), {
    message: "must be a numeric HubSpot id (1–19 digits)"
  });

export const webhookEventSchema = z
  .object({
    eventId: numericIdField,
    subscriptionType: subscriptionTypeSchema,
    objectId: numericIdField,
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
