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
import { parseDtoOrInternalError } from "../../shared/dto-parse";
import { NotFoundError } from "../../shared/errors";
import { buildSortedPage, type PageResult } from "../../shared/sorted-pagination";
import { scheduleTtlRefresh as runTtlRefresh } from "../../shared/ttl-refresh";
import { hubspot } from "../hubspot/hubspot.client";
import { mapHubspotCompanyToRow } from "../hubspot/hubspot.mapper";
import type { Company } from "../../db/schema";
import {
  cursorValueForRow,
  findCompanyById,
  findCompanyByHubspotId,
  listCompanies,
  upsertCompany,
  type ListCompaniesArgs
} from "./companies.repository";
import { companyPublicSchema, type CompanyPublic } from "./companies.schemas";

function toPublic(row: Company): CompanyPublic {
  return parseDtoOrInternalError(
    companyPublicSchema,
    {
      id: row.id,
      hubspotCompanyId: row.hubspotCompanyId,
      name: row.name,
      companyType: row.companyType,
      segmentType: row.segmentType,
      lifecycleStage: row.lifecycleStage,
      hsTaskLabel: row.hsTaskLabel,
      hubspotCreatedAt: row.hubspotCreatedAt.toISOString(),
      hubspotModifiedAt: row.hubspotModifiedAt.toISOString(),
      lastSyncedAt: row.lastSyncedAt.toISOString(),
      hubspotDeletedAt: row.hubspotDeletedAt ? row.hubspotDeletedAt.toISOString() : null
    },
    "companies.toPublic"
  );
}

export type CompanyListPage = PageResult<CompanyPublic>;

export async function searchCompanies(args: ListCompaniesArgs): Promise<CompanyListPage> {
  // Fetch limit+1 to detect whether more rows exist beyond this page;
  // buildSortedPage trims to `limit` and emits a cursor pointing at
  // the last kept row.
  const rows = await listCompanies({ ...args, limit: args.limit + 1 });
  return buildSortedPage(rows, args.limit, args.sort, toPublic, row => ({
    value: cursorValueForRow(row, args.sort.field),
    id: row.id
  }));
}

export async function getCompany(id: string): Promise<CompanyPublic> {
  const row = await findCompanyById(id);
  if (!row) throw new NotFoundError("Company");

  // TTL refresh — fire-and-forget background refetch when stale.
  // The helper never rejects: any background error is logged inside
  // the setImmediate callback.
  void scheduleTtlRefresh(row);

  return toPublic(row);
}

/**
 * If `last_synced_at` is older than the TTL, refetch from HubSpot
 * and upsert. Runs in background — caller never awaits.
 */
export async function scheduleTtlRefresh(row: Company): Promise<void> {
  return runTtlRefresh({
    lastSyncedAt: row.lastSyncedAt,
    ttlMs: env.HUBSPOT_SYNC_TTL_SECONDS * 1000,
    enabled: hubspot.isConfigured(),
    logLabel: "[companies] TTL refresh",
    logContext: { hubspotCompanyId: row.hubspotCompanyId },
    refresh: async () => {
      const fresh = await hubspot.getCompany(row.hubspotCompanyId);
      const mapped = mapHubspotCompanyToRow(fresh);
      if (mapped) await upsertCompany(mapped);
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
