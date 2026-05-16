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
  // NOTE: a `companyType` filter used to live here. It was removed
  // once HUBSPOT_COMPANY_TYPE_FILTER restricted the DB to a single
  // type — runtime filter on `direct_client` was effectively a
  // no-op. If the storage filter is ever loosened, re-add this.
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
