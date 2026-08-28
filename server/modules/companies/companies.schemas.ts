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
  // Min 2 chars: pg_trgm operates on TRIGRAMS — single-character
  // queries can't use the index and fall back to a sequential scan.
  // Capped at 200 to defang DoS-by-huge-pattern.
  q: z.string().min(2).max(200).optional(),
  // Sprint 7.2: per-column sort. Allowed values whitelisted by
  // the service via `parseSortQuery`. Default: "createdAt:desc".
  sort: z
    .string()
    .max(64)
    .regex(/^[a-zA-Z][\w]*:(asc|desc)$/, {
      message: "sort must be in 'field:asc' or 'field:desc' form"
    })
    .optional(),
  cursor: z.string().max(500).optional(),
  /**
   * Filter by company type. Added 2026-08-27 for the monday migration.
   *
   * Until now NO type filter existed anywhere in this endpoint — the
   * repository docblock claimed one, but `listCompanies` built its WHERE
   * from `q` and the cursor alone. Three `referring_partner` rows were
   * therefore already reachable from the wizard's client picker, told
   * apart only by the "(A) " prefix a human might notice in the name.
   *
   * That prefix does not exist in monday. Once the Agents board is
   * synced (~42 more rows) an operator could pick an agent as the
   * merchant for a real Offer and nothing would object — createDocument
   * validates that the company EXISTS, never what type it is.
   */
  companyType: z.preprocess(
    // An empty value means "no filter", not "invalid". A cached or
    // half-updated frontend sending `?companyType=` must not get a 400.
    v => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.enum(["direct_client", "referring_partner"]).optional()
  ),
  // Hard ceiling 50 — keeps query work bounded.
  limit: z.coerce.number().int().min(1).max(50).default(25)
});
export type ListCompaniesQuery = z.infer<typeof listCompaniesQuerySchema>;

// ─── Response DTOs ──────────────────────────────────────────────────

/**
 * Public-facing company shape. Excludes hubspot_raw (~260 props,
 * ~20kb each) — frontend never needs the full payload; if a feature
 * requires a field we promote it to a column.
 *
 * The schema is `.parse()`d on every projection via
 * `companies.service.toPublic()` (Sprint 2.7.F upgrade — was
 * type-only before). Server-side projection bugs now surface as
 * 500 INTERNAL_ERROR with detailed log instead of malformed JSON
 * silently shipping to the frontend.
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
  lastSyncedAt: z.string(),
  // ISO timestamp when HubSpot deleted/merged-away this company while it
  // still owned documents (so we retained the row). NULL = live in
  // HubSpot. Drives the admin "Deleted in HubSpot" badge.
  hubspotDeletedAt: z.string().nullable(),
  /**
   * Set when monday reports the client as deleted or archived. Separate
   * from `hubspotDeletedAt` because that column is written exclusively by
   * the HubSpot deletion webhook and freezes forever once HubSpot is off —
   * without this field a client removed from monday would look perfectly
   * live in the admin, and the purge action would be unreachable for every
   * future company.
   */
  crmDeletedAt: z.string().nullable(),
  /** Which kind of removal monday reported: archiving is reversible and does NOT unlock the purge. */
  crmDeletedReason: z.enum(["deleted", "archived"]).nullable(),
  /**
   * Set by the BACKFILL when a bound row is absent from its board. An
   * OBSERVATION, never an authorisation: it drives a badge and an alert
   * and must never unlock a purge — absence also means a paging glitch or
   * a permissions change.
   */
  crmMissingSince: z.string().nullable()
});
export type CompanyPublic = z.infer<typeof companyPublicSchema>;
