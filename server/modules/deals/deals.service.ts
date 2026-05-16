/**
 * Deals service.
 */

import { env } from "../../config/env";
import { NotFoundError } from "../../shared/errors";
import { buildPage, type PageResult } from "../../shared/build-page";
import { logger } from "../../middleware/logger";
import { getCompany, loadCompanyByHubspotIdOrNull } from "../companies/companies.service";
import { hubspot } from "../hubspot/hubspot.client";
import {
  extractDealCompanyCandidates,
  mapHubspotDealToRow
} from "../hubspot/hubspot.mapper";
import type { Deal } from "../../db/schema";
import type { HubspotObject } from "../hubspot/hubspot.types";
import {
  findDealById,
  listDeals,
  upsertDeal,
  type ListDealsArgs
} from "./deals.repository";
import type { DealPublic } from "./deals.schemas";

function toPublic(row: Deal): DealPublic {
  return {
    id: row.id,
    hubspotDealId: row.hubspotDealId,
    hubspotCompanyId: row.hubspotCompanyId,
    name: row.name,
    stage: row.stage,
    pipelineId: row.pipelineId,
    amount: row.amount,
    currency: row.currency,
    clientLabel: row.clientLabel,
    agentLabel: row.agentLabel,
    businessVertical: row.businessVertical,
    hubspotCreatedAt: row.hubspotCreatedAt.toISOString(),
    hubspotModifiedAt: row.hubspotModifiedAt.toISOString(),
    lastSyncedAt: row.lastSyncedAt.toISOString()
  };
}

export type DealListPage = PageResult<DealPublic>;

/**
 * Resolve a company UUID → its `hubspot_company_id`, then list the
 * deals belonging to it. Used by `GET /api/v1/companies/:id/deals`.
 *
 * Goes through `companies.service.getCompany` (NOT the repository)
 * to honour backend_conventions.md §1 + reuse the standard 404
 * NotFoundError envelope.
 */
export async function searchDealsByCompanyUuid(
  companyUuid: string,
  filters: Omit<ListDealsArgs, "hubspotCompanyId">
): Promise<DealListPage> {
  const company = await getCompany(companyUuid);
  return searchDeals({ ...filters, hubspotCompanyId: company.hubspotCompanyId });
}

export async function searchDeals(args: ListDealsArgs): Promise<DealListPage> {
  // Fetch limit+1 to detect a next-page; buildPage handles trimming.
  const rows = await listDeals({ ...args, limit: args.limit + 1 });
  return buildPage(rows, args.limit, toPublic, row => ({
    createdAt: row.createdAt.toISOString(),
    id: row.id
  }));
}

export async function getDeal(id: string): Promise<DealPublic> {
  const row = await findDealById(id);
  if (!row) throw new NotFoundError("Deal");

  scheduleTtlRefresh(row).catch(err => {
    logger.warn(
      { hubspotDealId: row.hubspotDealId, err: (err as Error).message },
      "[deals] TTL refresh failed"
    );
  });

  return toPublic(row);
}

/**
 * Resolve which company a deal should be FK-attached to.
 *
 * HubSpot's `hs_primary_associated_company` may point at an Agent
 * that's been filtered out of our cache by HUBSPOT_COMPANY_TYPE_FILTER.
 * In that case we fall back to any other associated company that DOES
 * exist locally (typically the Merchant). Returns null if NONE of the
 * candidates exists in our DB (genuine orphan).
 *
 * Shared between hubspot-backfill (one row per HubSpot list page) and
 * deals.service.scheduleTtlRefresh (one row at TTL refresh). Both
 * paths MUST use this — otherwise TTL would silently re-break
 * fallback rows like WORLDFY OY.
 */
export interface ResolvedCompany {
  hubspotCompanyId: string;
  /** True when the primary association matched (no fallback used). */
  isPrimary: boolean;
  /** The full ordered candidate list, useful for warn logs. */
  allCandidates: string[];
}

export async function resolveDealCompany(
  obj: HubspotObject
): Promise<ResolvedCompany | null> {
  const candidates = extractDealCompanyCandidates(obj);
  for (const candidate of candidates) {
    const exists = await loadCompanyByHubspotIdOrNull(candidate);
    if (exists) {
      return {
        hubspotCompanyId: candidate,
        isPrimary: candidate === candidates[0],
        allCandidates: candidates
      };
    }
  }
  return null;
}

/** Same TTL-refresh pattern as companies.service.scheduleTtlRefresh. */
export async function scheduleTtlRefresh(row: Deal): Promise<void> {
  if (!hubspot.isConfigured()) return;
  const ttlMs = env.HUBSPOT_SYNC_TTL_SECONDS * 1000;
  if (ttlMs <= 0) return;
  const ageMs = Date.now() - row.lastSyncedAt.getTime();
  if (ageMs < ttlMs) return;

  setImmediate(async () => {
    try {
      const fresh = await hubspot.getDeal(row.hubspotDealId);
      const mapped = mapHubspotDealToRow(fresh);
      if (!mapped) return;

      // Apply the same fallback policy as backfill so deals like
      // WORLDFY OY (primary = filtered-out Agent, fallback =
      // Merchant) don't silently fail FK on refresh.
      const resolved = await resolveDealCompany(fresh);
      if (!resolved) {
        logger.warn(
          { hubspotDealId: row.hubspotDealId, candidates: extractDealCompanyCandidates(fresh) },
          "[deals] TTL refresh: no candidate company in DB — refresh skipped, old row kept"
        );
        return;
      }
      if (!resolved.isPrimary) {
        logger.warn(
          {
            hubspotDealId: row.hubspotDealId,
            primaryCompany: resolved.allCandidates[0],
            chosenCompany: resolved.hubspotCompanyId
          },
          "[deals] TTL refresh: primary-association is filtered out, used fallback (sales should fix in HubSpot)"
        );
      }
      mapped.hubspotCompanyId = resolved.hubspotCompanyId;

      await upsertDeal(mapped);
      logger.info(
        { hubspotDealId: row.hubspotDealId, ageMs },
        "[deals] TTL refresh: row refreshed"
      );
    } catch (err) {
      logger.warn(
        {
          hubspotDealId: row.hubspotDealId,
          err: (err as Error).message
        },
        "[deals] TTL refresh: HubSpot fetch failed"
      );
    }
  });
}
