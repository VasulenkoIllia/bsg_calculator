/**
 * Zod schemas for the deals API.
 */

import { z } from "zod";

// ─── Query params ───────────────────────────────────────────────────

export const listDealsQuerySchema = z.object({
  // Filter by deal stage id (matches dealstage column).
  stage: z.string().min(1).max(64).optional(),
  // Filter by associated company. Either pass `?hubspotCompanyId=`
  // OR use the /api/v1/companies/:id/deals route — equivalent.
  hubspotCompanyId: z.string().min(1).max(64).optional(),
  // Filter by HubSpot business_vertical enum (iGaming / Crypto / …).
  // Free-text up to 64 chars to absorb a future HubSpot rename.
  businessVertical: z.string().min(1).max(64).optional(),
  // Sprint 7.2: per-column sort. Default createdAt:desc.
  sort: z
    .string()
    .max(64)
    .regex(/^[a-zA-Z][\w]*:(asc|desc)$/, {
      message: "sort must be in 'field:asc' or 'field:desc' form"
    })
    .optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25)
});
export type ListDealsQuery = z.infer<typeof listDealsQuerySchema>;

// ─── Response DTO ───────────────────────────────────────────────────

/**
 * Public-facing deal shape. Excludes `hubspot_raw` (~237 props per
 * row). Runtime-validated by `deals.service.toPublic()` via
 * parseDtoOrInternalError (Sprint 2.7.F).
 *
 * `amount`: numeric(14,2) → JS string. Frontend MUST `parseFloat`
 * before arithmetic. Format guaranteed `"\d+(\.\d{1,2})?"`.
 */
export const dealPublicSchema = z.object({
  id: z.string().uuid(),
  hubspotDealId: z.string(),
  hubspotCompanyId: z.string(),
  name: z.string(),
  stage: z.string().nullable(),
  pipelineId: z.string().nullable(),
  amount: z.string().nullable(), // pg numeric() — string in JS
  currency: z.string().nullable(),
  clientLabel: z.string().nullable(),
  agentLabel: z.string().nullable(),
  businessVertical: z.string().nullable(),
  hubspotCreatedAt: z.string(),
  hubspotModifiedAt: z.string(),
  lastSyncedAt: z.string()
});
export type DealPublic = z.infer<typeof dealPublicSchema>;
