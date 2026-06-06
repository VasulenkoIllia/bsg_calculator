/**
 * Companies endpoint wrappers.
 *
 * Backend reference: `server/modules/companies/companies.schemas.ts`.
 * Filter params here intentionally mirror the backend Zod schema so
 * an unknown query string is impossible to construct without TypeScript
 * complaining.
 */

import { apiClient } from "./client.js";
import type { CursorPage, PublicCompany, PublicDeal } from "./types.js";

/**
 * Sprint 7.2: per-column sort spec. Kept in lockstep with the
 * backend whitelist in
 * server/modules/companies/companies.repository.ts → companySortFields.
 */
export type CompanySortField =
  | "name"
  | "segmentType"
  | "lifecycleStage"
  | "hubspotModifiedAt"
  | "createdAt";

/** Sprint 7.2: typed sort string — `"name:asc"`, `"createdAt:desc"`, … */
export type CompanySortSpec = `${CompanySortField}:${"asc" | "desc"}`;

/**
 * Filter set accepted by GET /companies.
 *
 * `q` — case-insensitive substring search on company name. The
 * backend enforces min length 2 to avoid trigger-happy queries that
 * scan the entire pg_trgm index.
 */
export interface ListCompaniesParams {
  q?: string;
  /** Sprint 7.2: "field:asc" or "field:desc"; default "createdAt:desc". */
  sort?: CompanySortSpec;
  cursor?: string;
  limit?: number;
}

export async function listCompanies(
  params: ListCompaniesParams = {}
): Promise<CursorPage<PublicCompany>> {
  const { data } = await apiClient.get<CursorPage<PublicCompany>>("/companies", {
    params
  });
  return data;
}

export async function getCompany(id: string): Promise<PublicCompany> {
  const { data } = await apiClient.get<PublicCompany>(`/companies/${id}`);
  return data;
}

/** Summary returned by the admin company-purge endpoint. */
export interface PurgedCompanySummary {
  id: string;
  name: string;
  hubspotCompanyId: string;
  documents: number;
  deals: number;
}

/**
 * ADMIN — fully delete a HubSpot-deleted company + ALL its documents from
 * OUR system (DELETE /companies/:id). The server gates on admin/super_admin
 * AND refuses unless the company is flagged deleted-from-HubSpot.
 */
export async function purgeCompany(id: string): Promise<PurgedCompanySummary> {
  const { data } = await apiClient.delete<PurgedCompanySummary>(`/companies/${id}`);
  return data;
}

/**
 * GET /companies/:id/deals — deals belonging to a company.
 *
 * Server already filters by foreign key + auth; the helper is just
 * a typed convenience wrapper so the URL pattern lives in one file.
 */
/**
 * Sprint 7.2: deal sort spec. Same as `DealSortField` from
 * src/api/deals.ts, repeated here to keep this file self-contained
 * for callers that only import companies.ts.
 */
export type CompanyDealSortField =
  | "name"
  | "stage"
  | "businessVertical"
  | "amount"
  | "hubspotModifiedAt"
  | "createdAt";
export type CompanyDealSortSpec = `${CompanyDealSortField}:${"asc" | "desc"}`;

export interface ListCompanyDealsParams {
  stage?: string;
  businessVertical?: string;
  sort?: CompanyDealSortSpec;
  cursor?: string;
  limit?: number;
}

export async function listCompanyDeals(
  companyId: string,
  params: ListCompanyDealsParams = {}
): Promise<CursorPage<PublicDeal>> {
  const { data } = await apiClient.get<CursorPage<PublicDeal>>(
    `/companies/${companyId}/deals`,
    { params }
  );
  return data;
}
