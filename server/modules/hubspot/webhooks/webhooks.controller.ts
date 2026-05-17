/**
 * Webhook receiver + manual-refresh controllers.
 *
 * The receiver runs BEHIND the HMAC verification middleware, so by
 * the time we get here we trust the signature is valid and the body
 * has been re-parsed into a JS object. We validate against
 * `webhookBodySchema`, insert each event row, and ack 200. The
 * async worker (webhooks.processor) picks them up on its next tick.
 *
 * The refresh controller triggers the same processor logic for a
 * specific list of company ids — used by operators to force a sync
 * without waiting for the next HubSpot event.
 */

import type { Request, Response } from "express";
import { z } from "zod";
import { logger } from "../../../middleware/logger";
import { TokenInvalidError } from "../../../shared/errors";
import { hubspot } from "../hubspot.client";
import { mapHubspotCompanyToRow } from "../hubspot.mapper";
import { upsertCompany } from "../../companies/companies.repository";
import { insertEventIfNew } from "./webhooks.repository";
import {
  webhookBodySchema,
  type WebhookEvent
} from "./webhooks.schemas";

/**
 * Map a webhook event entry into the row shape stored in
 * `hubspot_webhook_events`. The object type is derived from the
 * subscriptionType prefix ('company' / 'deal').
 */
function eventToRow(event: WebhookEvent, raw: unknown) {
  const objectType = event.subscriptionType.startsWith("company.")
    ? ("company" as const)
    : ("deal" as const);
  return {
    hubspotEventId: event.eventId,
    subscriptionType: event.subscriptionType,
    objectType,
    hubspotObjectId: event.objectId,
    occurredAt: new Date(event.occurredAt),
    raw: raw as object
  };
}

export async function webhookReceiverController(
  req: Request,
  res: Response
): Promise<void> {
  // verifyHubspotSignature middleware reparsed req.body into the
  // event array. Run it through Zod for shape validation; anything
  // that doesn't match the supported subscription types gets dropped
  // with a warn log so subscription mismatches are visible.
  const parsed = webhookBodySchema.safeParse(req.body);
  if (!parsed.success) {
    // The middleware already verified the HMAC, so a malformed payload
    // here is "HubSpot sent us a subscription we don't model". Log
    // and ack — they should not retry. Returning 400 would cause
    // HubSpot to redeliver on the same schedule.
    logger.warn(
      { issues: parsed.error.issues.slice(0, 5) },
      "[hubspot:webhook] unrecognised payload shape — acking but skipping"
    );
    res.status(200).json({ accepted: 0, dropped: 0, malformed: true });
    return;
  }

  let accepted = 0;
  let deduped = 0;
  for (const event of parsed.data) {
    const inserted = await insertEventIfNew(eventToRow(event, event));
    if (inserted) {
      accepted += 1;
    } else {
      deduped += 1;
    }
  }
  logger.info(
    { accepted, deduped, batch: parsed.data.length },
    "[hubspot:webhook] events queued"
  );
  res.status(200).json({ accepted, deduped });
}

const refreshRequestSchema = z.object({
  // List of company UUIDs to refetch + upsert from HubSpot.
  // Sprint 5.F.1: cap reduced from 100 → 20 to defend the upstream
  // HubSpot per-10s budget (100 req / 10s). Combined with the
  // hubspotProxyLimiter (10 req/min/IP) this caps the per-IP load
  // at 200 HubSpot calls/min, well inside the 600/min budget so
  // operator refresh storms can't starve the webhook processor.
  //
  // Note: "refresh ALL" is intentionally NOT supported — the
  // backfill script (`npm run hubspot:backfill`) is the right tool
  // for that scenario and runs out-of-band of the request loop.
  companyIds: z.array(z.string().uuid()).min(1).max(20)
});

export async function refreshController(req: Request, res: Response): Promise<void> {
  if (!req.user) throw new TokenInvalidError();
  const body = refreshRequestSchema.parse(req.body ?? {});
  // For each company-id provided, look up the row, refetch from
  // HubSpot, and upsert. Returns a small report so the UI can show
  // "Refreshed X companies, skipped Y" toast.
  let refreshed = 0;
  let failed = 0;
  const ids = body.companyIds;
  for (const id of ids) {
    try {
      // Look up our row to get its hubspotCompanyId.
      const { companies } = await import("../../../db/schema");
      const { db } = await import("../../../db/client");
      const { eq } = await import("drizzle-orm");
      const rows = await db
        .select()
        .from(companies)
        .where(eq(companies.id, id))
        .limit(1);
      const row = rows[0];
      if (!row) {
        failed += 1;
        continue;
      }
      const obj = await hubspot.getCompany(row.hubspotCompanyId);
      const mapped = mapHubspotCompanyToRow(obj);
      if (!mapped) {
        failed += 1;
        continue;
      }
      await upsertCompany(mapped);
      refreshed += 1;
    } catch (err) {
      failed += 1;
      logger.warn(
        { id, err: (err as Error).message },
        "[hubspot:refresh] company refresh failed"
      );
    }
  }
  res.status(200).json({ refreshed, failed, requested: ids.length });
}
