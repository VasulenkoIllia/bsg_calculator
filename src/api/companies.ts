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
 * Filter set accepted by GET /companies.
 *
 * `q` — case-insensitive substring search on company name. The
 * backend enforces min length 2 to avoid trigger-happy queries that
 * scan the entire pg_trgm index.
 */
export interface ListCompaniesParams {
  q?: string;
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

/**
 * GET /companies/:id/deals — deals belonging to a company.
 *
 * Server already filters by foreign key + auth; the helper is just
 * a typed convenience wrapper so the URL pattern lives in one file.
 */
export interface ListCompanyDealsParams {
  stage?: string;
  businessVertical?: string;
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
