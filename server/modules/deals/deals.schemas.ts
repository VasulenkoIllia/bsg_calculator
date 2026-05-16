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
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25)
});
export type ListDealsQuery = z.infer<typeof listDealsQuerySchema>;

// ─── Response DTO ───────────────────────────────────────────────────

/**
 * Public-facing deal shape. Excludes `hubspot_raw` (~237 props per
 * row). Type-inference only — no runtime parse on the way out (see
 * companies.schemas.ts for the same note).
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
