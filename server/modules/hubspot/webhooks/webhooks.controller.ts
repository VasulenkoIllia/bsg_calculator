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
import {
  findCompanyById,
  upsertCompany
} from "../../companies/companies.repository";
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
/**
 * Sprint 5.F.3: cap the per-event JSONB payload at 64 KB. The raw
 * body parser already gates the whole request at 1 MB, and a single
 * HubSpot event payload is typically <2 KB. 64 KB gives 30× headroom
 * for HubSpot to add fields without blowing up the row. A pathological
 * event with a huge attachment-like blob would still get stored at
 * the truncated marker rather than bloating the table.
 */
const MAX_RAW_BYTES = 64 * 1024;

function eventToRow(event: WebhookEvent, raw: unknown) {
  const objectType = event.subscriptionType.startsWith("company.")
    ? ("company" as const)
    : ("deal" as const);

  // Clamp the persisted `raw` payload so a single anomalously-large
  // event can't bloat the row. We measure the JSON-encoded size
  // (cheap; HubSpot bodies are already JSON). Over-budget bodies are
  // replaced with a marker object that records the truncation so
  // operators triaging the row know to look elsewhere for full detail.
  let safeRaw: unknown = raw;
  try {
    const encoded = JSON.stringify(raw);
    if (encoded && Buffer.byteLength(encoded, "utf8") > MAX_RAW_BYTES) {
      safeRaw = {
        _truncated: true,
        _originalBytes: Buffer.byteLength(encoded, "utf8"),
        // Keep the first 1 KB so the row stays inspectable.
        _preview: encoded.slice(0, 1024)
      };
    }
  } catch {
    safeRaw = { _truncated: true, _reason: "JSON.stringify threw" };
  }

  return {
    hubspotEventId: event.eventId,
    subscriptionType: event.subscriptionType,
    objectType,
    hubspotObjectId: event.objectId,
    occurredAt: new Date(event.occurredAt),
    // Drizzle's jsonb column expects `unknown` (any JSON value); the
    // previous `as object` cast was narrower than the column type AND
    // would silently pass `null` since `typeof null === "object"`.
    raw: safeRaw
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
    // Compute how many events HubSpot tried to deliver in this batch
    // so the response is honest about what we dropped. The body is
    // expected to be a JSON array — count it if possible, otherwise
    // surface `null` so the caller can distinguish "wrong shape at
    // root" from "all N events were the wrong shape".
    const droppedCount = Array.isArray(req.body) ? req.body.length : null;
    logger.warn(
      { issues: parsed.error.issues.slice(0, 5), droppedCount },
      "[hubspot:webhook] unrecognised payload shape — acking but skipping"
    );
    res.status(200).json({
      accepted: 0,
      dropped: droppedCount,
      malformed: true
    });
    return;
  }

  let accepted = 0;
  let deduped = 0;
  // Sprint 5.F.3: log breakdown by objectType so ops triaging a
  // delivery storm can see at a glance whether HubSpot fired company
  // events, deal events, or both.
  let companies = 0;
  let deals = 0;
  for (const event of parsed.data) {
    if (event.subscriptionType.startsWith("company.")) companies += 1;
    else deals += 1;
    const inserted = await insertEventIfNew(eventToRow(event, event));
    if (inserted) {
      accepted += 1;
    } else {
      deduped += 1;
    }
  }
  logger.info(
    { accepted, deduped, batch: parsed.data.length, companies, deals },
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

/**
 * Manual operator resync — refetch each given company from HubSpot
 * and upsert. Bearer-auth required, but there is NO per-resource
 * ownership check: every authenticated user may refresh any company.
 *
 * Sprint 5.F.2: this is an INTENTIONAL design gap, consistent with
 * the Sprint 2.8 decision to ship without RBAC. When admin/regular-
 * user roles are introduced (Phase 9+), this endpoint should gate on
 * the `admin` role before any per-resource check would even matter.
 * Documented in `docs/decisions.md` → Sprint 5.F entry.
 */
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
      // Sprint 5.F.2: route the lookup through the companies repo
      // (single chokepoint for table access — previously this used
      // dynamic `await import()` of schema/db/eq inside the loop,
      // which both bypassed the repository boundary AND added module-
      // resolution cost per iteration).
      const row = await findCompanyById(id);
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
