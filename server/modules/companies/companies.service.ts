/**
 * Companies service.
 *
 * Wraps the repository with business logic:
 *   - Public DTO projection (drops `hubspot_raw` blob from responses).
 *   - TTL-driven background refresh: when an operator GETs a single
 *     company older than HUBSPOT_SYNC_TTL_SECONDS, the response is
 *     served from cache and a non-blocking refetch+upsert kicks off.
 *
 * The async refetch is fire-and-forget by design — operator gets
 * data instantly; the next request (~5s+) sees the fresh values.
 */

import { env } from "../../config/env";
import { NotFoundError } from "../../shared/errors";
import { buildPage, type PageResult } from "../../shared/build-page";
import { logger } from "../../middleware/logger";
import { hubspot } from "../hubspot/hubspot.client";
import { mapHubspotCompanyToRow } from "../hubspot/hubspot.mapper";
import type { Company } from "../../db/schema";
import {
  findCompanyById,
  findCompanyByHubspotId,
  listCompanies,
  upsertCompany,
  type ListCompaniesArgs
} from "./companies.repository";
import type { CompanyPublic } from "./companies.schemas";

function toPublic(row: Company): CompanyPublic {
  return {
    id: row.id,
    hubspotCompanyId: row.hubspotCompanyId,
    name: row.name,
    companyType: row.companyType,
    segmentType: row.segmentType,
    lifecycleStage: row.lifecycleStage,
    hsTaskLabel: row.hsTaskLabel,
    hubspotCreatedAt: row.hubspotCreatedAt.toISOString(),
    hubspotModifiedAt: row.hubspotModifiedAt.toISOString(),
    lastSyncedAt: row.lastSyncedAt.toISOString()
  };
}

export type CompanyListPage = PageResult<CompanyPublic>;

export async function searchCompanies(args: ListCompaniesArgs): Promise<CompanyListPage> {
  // Fetch limit+1 to detect whether more rows exist beyond this page;
  // buildPage trims to `limit` and emits a cursor pointing at the
  // last kept row. See shared/build-page.ts.
  const rows = await listCompanies({ ...args, limit: args.limit + 1 });
  return buildPage(rows, args.limit, toPublic, row => ({
    createdAt: row.createdAt.toISOString(),
    id: row.id
  }));
}

export async function getCompany(id: string): Promise<CompanyPublic> {
  const row = await findCompanyById(id);
  if (!row) throw new NotFoundError("Company");

  // TTL refresh — fire-and-forget background refetch when stale.
  scheduleTtlRefresh(row).catch(err => {
    logger.warn(
      { hubspotCompanyId: row.hubspotCompanyId, err: (err as Error).message },
      "[companies] TTL refresh failed"
    );
  });

  return toPublic(row);
}

/**
 * If `last_synced_at` is older than the TTL, refetch from HubSpot
 * and upsert. Runs in background — caller never awaits.
 *
 * Public so deals.service can call it transitively when an operator
 * pulls a deal whose company is also stale.
 */
export async function scheduleTtlRefresh(row: Company): Promise<void> {
  if (!hubspot.isConfigured()) return; // dev / test without token
  const ttlMs = env.HUBSPOT_SYNC_TTL_SECONDS * 1000;
  if (ttlMs <= 0) return;
  const ageMs = Date.now() - row.lastSyncedAt.getTime();
  if (ageMs < ttlMs) return;

  setImmediate(async () => {
    try {
      const fresh = await hubspot.getCompany(row.hubspotCompanyId);
      const mapped = mapHubspotCompanyToRow(fresh);
      if (mapped) {
        await upsertCompany(mapped);
        logger.info(
          { hubspotCompanyId: row.hubspotCompanyId, ageMs },
          "[companies] TTL refresh: row refreshed"
        );
      }
    } catch (err) {
      logger.warn(
        {
          hubspotCompanyId: row.hubspotCompanyId,
          err: (err as Error).message
        },
        "[companies] TTL refresh: HubSpot fetch failed"
      );
    }
  });
}

/** Lookup helper used by deals.service to satisfy the FK relation. */
export async function getCompanyByHubspotId(hubspotCompanyId: string): Promise<CompanyPublic> {
  const row = await findCompanyByHubspotId(hubspotCompanyId);
  if (!row) throw new NotFoundError("Company");
  return toPublic(row);
}

/**
 * Cross-module helper: cheap "does this hubspot_company_id exist in
 * our cache?" check. Returns the row or undefined — NEVER throws.
 *
 * Used by:
 *   - hubspot-backfill (deal loop) to skip orphan deals
 *   - deals.service (TTL refresh) to apply the same fallback policy
 *
 * Going through the service rather than letting callers reach into
 * the repository keeps backend_conventions.md §1 happy.
 */
export async function loadCompanyByHubspotIdOrNull(
  hubspotCompanyId: string
): Promise<Company | undefined> {
  return findCompanyByHubspotId(hubspotCompanyId);
}
