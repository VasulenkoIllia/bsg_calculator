/**
 * Deals endpoint wrappers.
 *
 * Backend reference: `server/modules/deals/deals.schemas.ts`. Note
 * that `companies.ts` also exports `listCompanyDeals` for the nested
 * `/companies/:id/deals` URL — both helpers exist because the UI's
 * "all deals" page and the "deals on this company" tab have
 * different filtering needs.
 *
 * NOTE: `listDeals` and `getDeal` below are currently UNUSED by any
 * page or hook. They were scaffolded for a future "all deals" page;
 * until that lands, they remain importable but unreached. Sprint 3+
 * will wire them up when a deals listing page is built — until then,
 * keeping them prevents the api surface from drifting from the
 * backend's schema.
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
