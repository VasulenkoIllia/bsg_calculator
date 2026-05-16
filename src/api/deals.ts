/**
 * Deals endpoint wrappers.
 *
 * Backend reference: `server/modules/deals/deals.schemas.ts`. Note
 * that `companies.ts` also exports `listCompanyDeals` for the nested
 * `/companies/:id/deals` URL — both helpers exist because the UI's
 * "all deals" page and the "deals on this company" tab have
 * different filtering needs.
 */

import { apiClient } from "./client.js";
import type { CursorPage, PublicDeal } from "./types.js";

export interface ListDealsParams {
  stage?: string;
  hubspotCompanyId?: string;
  businessVertical?: string;
  cursor?: string;
  limit?: number;
}

export async function listDeals(
  params: ListDealsParams = {}
): Promise<CursorPage<PublicDeal>> {
  const { data } = await apiClient.get<CursorPage<PublicDeal>>("/deals", {
    params
  });
  return data;
}

export async function getDeal(id: string): Promise<PublicDeal> {
  const { data } = await apiClient.get<PublicDeal>(`/deals/${id}`);
  return data;
}
