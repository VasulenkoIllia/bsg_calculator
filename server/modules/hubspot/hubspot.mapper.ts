/**
 * HubSpot payload → our DB row mapper.
 *
 * Pure, sync transformations. No DB calls — repositories receive the
 * mapped row and decide upsert vs insert.
 *
 * Robustness: HubSpot occasionally sends invalid timestamps or
 * missing primary-association ids. We log + skip orphans rather than
 * crash the backfill loop. Mapper returns `null` for an
 * unprocessable row; the caller filters it out.
 */

import { logger } from "../../middleware/logger";
import type { NewCompany, NewDeal } from "../../db/schema";
import type { HubspotObject } from "./hubspot.types";

/**
 * Map a HubSpot company object into our INSERT row shape.
 *
 * Required HubSpot properties: `hs_object_id`, `name`, `createdate`,
 * `hs_lastmodifieddate`. If any is missing the row is unusable —
 * return null + log.
 */
export function mapHubspotCompanyToRow(obj: HubspotObject): NewCompany | null {
  const props = obj.properties;
  const id = obj.id ?? props.hs_object_id;
  const name = props.name;
  const createdAt = parseTimestamp(props.createdate);
  const modifiedAt = parseTimestamp(props.hs_lastmodifieddate);

  if (!id || !name || !createdAt || !modifiedAt) {
    logger.warn(
      { hubspotId: id, missing: { name: !name, createdAt: !createdAt, modifiedAt: !modifiedAt } },
      "[hubspot.mapper] skipping malformed company"
    );
    return null;
  }

  return {
    hubspotCompanyId: id,
    name,
    companyType: nullableString(props.company_type),
    segmentType: nullableString(props.segment_type),
    lifecycleStage: nullableString(props.lifecyclestage),
    hsTaskLabel: nullableString(props.hs_task_label),
    hubspotCreatedAt: createdAt,
    hubspotModifiedAt: modifiedAt,
    // Persist the full payload (everything HubSpot returned) so
    // future feature work can promote a JSONB field to a column
    // without re-fetching from HubSpot.
    hubspotRaw: props,
    lastSyncedAt: new Date()
  };
}

/**
 * Map a HubSpot deal object into our INSERT row shape.
 *
 * Required HubSpot properties: `hs_object_id`,
 * `hs_primary_associated_company` (deal MUST belong to a company in
 * our system), `dealname`, `createdate`, `hs_lastmodifieddate`.
 * Without an associated company the FK insert would fail anyway —
 * we log + skip.
 */
export function mapHubspotDealToRow(obj: HubspotObject): NewDeal | null {
  const props = obj.properties;
  const id = obj.id ?? props.hs_object_id;
  const companyId =
    props.hs_primary_associated_company ??
    obj.associations?.companies?.results[0]?.id ??
    null;
  const name = props.dealname;
  const createdAt = parseTimestamp(props.createdate);
  const modifiedAt = parseTimestamp(props.hs_lastmodifieddate);

  if (!id || !companyId || !name || !createdAt || !modifiedAt) {
    logger.warn(
      {
        hubspotId: id,
        missing: {
          companyId: !companyId,
          name: !name,
          createdAt: !createdAt,
          modifiedAt: !modifiedAt
        }
      },
      "[hubspot.mapper] skipping malformed or orphan deal"
    );
    return null;
  }

  return {
    hubspotDealId: id,
    hubspotCompanyId: companyId,
    name,
    stage: nullableString(props.dealstage),
    pipelineId: nullableString(props.pipeline),
    amount: nullableString(props.amount), // numeric() is a string in pg
    currency: nullableString(props.deal_currency_code),
    clientLabel: nullableString(props.client),
    agentLabel: nullableString(props.agent),
    businessVertical: nullableString(props.business_vertical),
    hubspotCreatedAt: createdAt,
    hubspotModifiedAt: modifiedAt,
    hubspotRaw: props,
    lastSyncedAt: new Date()
  };
}

/** HubSpot serialises timestamps as ISO strings or epoch-ms strings. */
function parseTimestamp(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  // ISO format: "2026-04-17T16:02:14.684Z"
  if (raw.includes("T") || raw.includes("-")) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  // Numeric epoch (ms or s)
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  // HubSpot sometimes returns seconds, sometimes ms. Heuristic:
  // anything below 1e12 is seconds (year ~2001), else ms.
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "" / null / undefined → null. Otherwise return the trimmed value. */
function nullableString(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  return trimmed.length === 0 ? null : trimmed;
}
