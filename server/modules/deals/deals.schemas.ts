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

export const dealPublicSchema = z.object({
  id: z.string().uuid(),
  hubspotDealId: z.string(),
  hubspotCompanyId: z.string(),
  name: z.string(),
  stage: z.string().nullable(),
  pipelineId: z.string().nullable(),
  amount: z.string().nullable(), // numeric() serialises as string
  currency: z.string().nullable(),
  clientLabel: z.string().nullable(),
  agentLabel: z.string().nullable(),
  businessVertical: z.string().nullable(),
  hubspotCreatedAt: z.string(),
  hubspotModifiedAt: z.string(),
  lastSyncedAt: z.string()
});
export type DealPublic = z.infer<typeof dealPublicSchema>;
