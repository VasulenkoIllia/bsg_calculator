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
 * The event types we model. Anything outside this enum fails Zod
 * validation, and because `webhookBodySchema` validates the WHOLE
 * array at once, ONE unmodeled event drops the entire batch (the
 * receiver acks-but-skips it). HubSpot delivers `merge`,
 * `associationChange`, and `restore` events on the same
 * subscriptions as creation/propertyChange, so leaving them out of
 * this list silently discarded the creation/propertyChange events
 * that shared their batch — a broad cache-drift source. They are
 * listed here so batches are never dropped.
 *
 * Handling per type (see webhooks.processor.ts):
 *   - creation / propertyChange / restore / associationChange →
 *     fetch-from-HubSpot + upsert (restore re-adds, associationChange
 *     re-syncs).
 *   - deletion → DELETE from our cache.
 *   - merge → re-point the merged-away (secondary) object's owned
 *     rows to the surviving primary, then remove the secondary
 *     (company.merge: full re-point; deal.merge: delete secondaries).
 */
export const SUPPORTED_SUBSCRIPTION_TYPES = [
  "company.creation",
  "company.propertyChange",
  "company.deletion",
  "company.merge",
  "company.restore",
  "company.associationChange",
  "deal.creation",
  "deal.propertyChange",
  "deal.deletion",
  "deal.merge",
  "deal.restore",
  "deal.associationChange"
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
    occurredAt: z.number().int().positive(), // epoch ms
    // Merge-only fields (HubSpot sends them ONLY on `*.merge` events):
    // `primaryObjectId` is the surviving object; `mergedObjectIds` are
    // the secondaries that were merged away (now 404 in HubSpot). Both
    // optional + tolerant via `.catch` so a quirky payload can't fail
    // the whole event — the processor reads them back off `raw` via
    // `readMergeIds`. See https://developers.hubspot.com/changelog/new-subscription-types-for-webhooks
    primaryObjectId: numericIdField.optional().catch(undefined),
    mergedObjectIds: z.array(numericIdField).optional().catch(undefined)
  })
  .passthrough();

export type WebhookEvent = z.infer<typeof webhookEventSchema>;

/**
 * Extract the merge participant ids from a stored `raw` event JSONB.
 * The processor works off the persisted `hubspot_webhook_events` row
 * (not the live Zod event), so it re-parses `raw` defensively here.
 * Returns `{ primaryObjectId: null, mergedObjectIds: [] }` for any
 * non-merge / malformed payload — callers treat that as a no-op.
 */
const mergeIdsSchema = z
  .object({
    primaryObjectId: numericIdField.optional().catch(undefined),
    mergedObjectIds: z.array(numericIdField).optional().catch(undefined)
  })
  .passthrough();

export function readMergeIds(raw: unknown): {
  primaryObjectId: string | null;
  mergedObjectIds: string[];
} {
  const parsed = mergeIdsSchema.safeParse(raw);
  if (!parsed.success) {
    return { primaryObjectId: null, mergedObjectIds: [] };
  }
  return {
    primaryObjectId: parsed.data.primaryObjectId ?? null,
    mergedObjectIds: parsed.data.mergedObjectIds ?? []
  };
}

/**
 * HubSpot sends events as an array. Empty arrays are rejected
 * (would indicate a misconfigured test ping).
 */
export const webhookBodySchema = z.array(webhookEventSchema).min(1);
export type WebhookBody = z.infer<typeof webhookBodySchema>;
