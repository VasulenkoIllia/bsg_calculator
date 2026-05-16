/**
 * Zod schemas for the companies API.
 *
 * Used by controllers to validate query params + by the DTO type
 * exports the frontend will consume from `src/lib/api/companies.ts`.
 */

import { z } from "zod";

// ─── Query params ───────────────────────────────────────────────────

export const listCompaniesQuerySchema = z.object({
  // Substring search on companies.name via pg_trgm GIN index.
  // Caps length to 200 chars — anything longer is suspicious.
  q: z.string().min(1).max(200).optional(),
  // Agent/Merchant filter. Strings come from HubSpot's enum, which
  // we keep loosely typed at the DB layer so new values don't break
  // migrations.
  companyType: z.enum(["referring_partner", "direct_client"]).optional(),
  // Opaque cursor — base64-encoded `{ createdAt, id }` (see shared/pagination.ts).
  cursor: z.string().max(500).optional(),
  // Server clamps to min(requested, 50) regardless.
  limit: z.coerce.number().int().min(1).max(50).default(25)
});
export type ListCompaniesQuery = z.infer<typeof listCompaniesQuerySchema>;

// ─── Response DTOs ──────────────────────────────────────────────────

/**
 * Public-facing company shape. Excludes hubspot_raw (~260 props,
 * ~20kb each) — frontend never needs the full payload; if a feature
 * requires a field we promote it to a column.
 */
export const companyPublicSchema = z.object({
  id: z.string().uuid(),
  hubspotCompanyId: z.string(),
  name: z.string(),
  companyType: z.string().nullable(),
  segmentType: z.string().nullable(),
  lifecycleStage: z.string().nullable(),
  hsTaskLabel: z.string().nullable(),
  hubspotCreatedAt: z.string(),
  hubspotModifiedAt: z.string(),
  lastSyncedAt: z.string()
});
export type CompanyPublic = z.infer<typeof companyPublicSchema>;
