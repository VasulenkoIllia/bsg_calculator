/**
 * HubSpot CRM v3 API response types + Zod schemas.
 *
 * Reflects the actual shape returned by the BSG account's HubSpot
 * (validated via the `hubspot:one-company` / `hubspot:merchant-and-deal`
 * scripts on 2026-05-14/15). The schemas drive soft-validation in
 * `hubspot.client.ts` — on shape drift we LOG and fall through to
 * the cast (no breakage), so a HubSpot field rename produces a
 * visible warn rather than silent undefined.
 */

import { z } from "zod";

// ─── Property values: HubSpot serialises ALL property values as
// strings or nulls in v3 API (even amounts and booleans). Be strict
// about the leaf type; permissive `.passthrough()` on the outer
// object so unknown sibling fields don't break parsing.
const propertyValueSchema = z.union([z.string(), z.null()]);

export const hubspotAssociationsSchema = z
  .object({
    companies: z
      .object({
        results: z.array(z.object({ id: z.string(), type: z.string() }))
      })
      .optional(),
    contacts: z
      .object({
        results: z.array(z.object({ id: z.string(), type: z.string() }))
      })
      .optional()
  })
  .passthrough();

export const hubspotObjectSchema = z
  .object({
    id: z.string(),
    properties: z.record(propertyValueSchema),
    createdAt: z.string(),
    updatedAt: z.string(),
    archived: z.boolean().optional(),
    associations: hubspotAssociationsSchema.optional()
  })
  .passthrough();

export const hubspotListResponseSchema = z
  .object({
    results: z.array(hubspotObjectSchema),
    paging: z
      .object({
        next: z
          .object({
            after: z.string(),
            link: z.string()
          })
          .optional()
      })
      .optional()
  })
  .passthrough();

/** A single object — company or deal — as HubSpot returns it. */
export type HubspotObject = z.infer<typeof hubspotObjectSchema>;

/** Associations map keyed by associated-object type ("companies", "contacts"). */
export type HubspotAssociations = z.infer<typeof hubspotAssociationsSchema>;

/** Paginated list response. `paging.next` is absent on the last page. */
export type HubspotListResponse = z.infer<typeof hubspotListResponseSchema>;

/**
 * The property names we explicitly request on each list/get call.
 * HubSpot returns ONLY a tiny default subset unless `properties` is
 * provided as a comma-separated query string. We send the full set
 * so the upserted `hubspot_raw` JSONB has everything we care about.
 */
export const COMPANY_PROPERTIES: readonly string[] = [
  // 8 extracted columns
  "hs_object_id",
  "name",
  "company_type",
  "segment_type",
  "lifecyclestage",
  "hs_task_label",
  "createdate",
  "hs_lastmodifieddate",
  // Useful display fields we keep in JSONB
  "domain",
  "country",
  "city",
  "industry",
  "phone",
  "description",
  "hubspot_owner_id",
  "num_associated_contacts",
  "num_notes",
  // BSG custom fields not yet extracted to columns
  "industry_type",
  "submitter_telegram",
  "from_where_and_whom_you_come_to_us",
  "referral_source"
] as const;

export const DEAL_PROPERTIES: readonly string[] = [
  // 12 extracted columns
  "hs_object_id",
  "hs_primary_associated_company",
  "dealname",
  "dealstage",
  "pipeline",
  "amount",
  "deal_currency_code",
  "client",
  "agent",
  "business_vertical",
  "createdate",
  "hs_lastmodifieddate",
  // Pricing fields we INTENTIONALLY do not extract to columns —
  // they live only in hubspot_raw JSONB per the link-only model.
  "forecasted_monthly_volume",
  "forecasted_transaction_count",
  "transaction_fee__mdr",
  "cost_per_transaction",
  "setup_fee",
  "chargeback_fee",
  "min_monthly_fee",
  "current_chargeback_rate",
  "switzerland_share_in_total_europe_volume",
  "united_kingdom_share_in_total_europe_volume",
  // Context fields kept in JSONB
  "closedate",
  "business_description",
  "clientele_type",
  "monthly_volume_range",
  "monthly_txn_range",
  "processing_currencies",
  "processing_jurisdictions",
  "payment_rails",
  "payout_destinations",
  "apm_detail",
  // KYB fields kept in JSONB
  "is_licensed",
  "is_startup",
  "license_type",
  "incorporation_date",
  "company_registration_country",
  "operating_duration",
  "ubo_data",
  "website_urls",
  "order_reference_number"
] as const;

/** Pipeline + stages response from `/crm/v3/pipelines/deals`. */
export const hubspotPipelinesResponseSchema = z
  .object({
    results: z.array(
      z
        .object({
          id: z.string(),
          label: z.string(),
          archived: z.boolean(),
          displayOrder: z.number(),
          stages: z.array(
            z
              .object({
                id: z.string(),
                label: z.string(),
                displayOrder: z.number(),
                archived: z.boolean(),
                metadata: z.record(z.string())
              })
              .passthrough()
          )
        })
        .passthrough()
    )
  })
  .passthrough();

export type HubspotPipelinesResponse = z.infer<typeof hubspotPipelinesResponseSchema>;
