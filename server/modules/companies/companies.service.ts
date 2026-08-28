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
import { db } from "../../db/client";
import { parseDtoOrInternalError } from "../../shared/dto-parse";
import { NotFoundError, ValidationError } from "../../shared/errors";
import { buildSortedPage, type PageResult } from "../../shared/sorted-pagination";
import { scheduleTtlRefresh as runTtlRefresh } from "../../shared/ttl-refresh";
import { hubspot } from "../hubspot/hubspot.client";
import { monday } from "../monday/monday.client";
import { refreshCompanyFromMonday } from "../monday/monday.refresh";
import { mapHubspotCompanyToRow } from "../hubspot/hubspot.mapper";
import { hardDeleteDocumentsByCompanyId } from "../documents/documents.repository";
import { deleteDealsByCompanyId } from "../deals/deals.repository";
import type { Company } from "../../db/schema";
import {
  cursorValueForRow,
  deleteCompanyByHubspotId,
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
      hubspotDeletedAt: row.hubspotDeletedAt ? row.hubspotDeletedAt.toISOString() : null,
      crmDeletedAt: row.crmDeletedAt ? row.crmDeletedAt.toISOString() : null,
      crmDeletedReason: row.crmDeletedReason ?? null,
      crmMissingSince: row.crmMissingSince ? row.crmMissingSince.toISOString() : null
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
  // Refresh from whichever CRM is ACTIVE. This used to be HubSpot-only,
  // which meant the self-healing path simply stopped existing at the
  // cutover: freshness rested entirely on webhooks, so a webhook deleted
  // in monday — or an event that burned its five retries — left a row
  // wrong indefinitely with nothing to notice. HubSpot had this safety
  // net for a year; monday now has the same one.
  const usingMonday = env.CRM_PROVIDER === "monday";

  return runTtlRefresh({
    lastSyncedAt: row.lastSyncedAt,
    ttlMs: env.HUBSPOT_SYNC_TTL_SECONDS * 1000,
    // An unbound row has nothing to refresh FROM — the remap has not
    // reached it (the five test companies are the live example). Firing a
    // fetch for it would be a guaranteed miss on every stale read.
    enabled: usingMonday
      ? monday.isConfigured() && row.crmItemId !== null
      : hubspot.isConfigured(),
    logLabel: usingMonday ? "[companies] monday TTL refresh" : "[companies] HubSpot TTL refresh",
    logContext: usingMonday
      ? { crmItemId: row.crmItemId }
      : { hubspotCompanyId: row.hubspotCompanyId },
    refresh: usingMonday
      ? () =>
          refreshCompanyFromMonday({
            crmItemId: row.crmItemId as string,
            crmBoardId: row.crmBoardId ?? null,
            companyType: row.companyType ?? null
          })
      : async () => {
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

export interface PurgedCompanySummary {
  id: string;
  name: string;
  hubspotCompanyId: string;
  documents: number;
  deals: number;
}

/**
 * ADMIN action — fully remove a company from OUR system (NOT HubSpot):
 * the company + ALL its documents (their `document_events` cascade), its
 * deals, and its calculator-configs (cascade on the company delete). One
 * transaction. Returns the deleted counts for the audit log.
 *
 * GUARD: only a company that HubSpot ALREADY deleted (`hubspot_deleted_at`
 * is set) may be purged — we must never hard-delete the documents of a
 * company that is still live in HubSpot. The admin/super_admin
 * authorization is enforced at the route. IRREVERSIBLE.
 */
export async function purgeDeletedCompany(companyId: string): Promise<PurgedCompanySummary> {
  const company = await findCompanyById(companyId);
  if (!company) throw new NotFoundError("Company");
  // `hubspotDeletedAt` is written ONLY by the HubSpot deletion webhook, so
  // it freezes at its current value the moment HubSpot is switched off. A
  // guard reading it alone would make this action permanently unreachable
  // for every company deleted in monday from then on.
  //
  // `crmMissingSince` is deliberately NOT accepted here: absence from a
  // backfill is an observation, not a confirmed deletion, and a paging
  // glitch must never unlock a destructive action.
  if (!company.hubspotDeletedAt && !company.crmDeletedAt) {
    throw new ValidationError(
      [{ path: ["company"], message: "company is still live in the CRM" }],
      "Only a company that was deleted from the CRM can be removed from the system."
    );
  }
  // An ARCHIVED monday item is not a deletion. monday sets the same
  // `item_deleted`-shaped signal for both, and the processor records which
  // one it was — because archiving is a routine, one-click, REVERSIBLE
  // tidy-up, while this function hard-deletes the company's documents and
  // is not reversible at all. Letting the two share a code path would mean
  // an operator clearing their board could unlock the destruction of
  // signed records. Restoring the item in monday clears the flag (the
  // backfill and the webhook both do this) and the purge becomes available
  // again if it is ever genuinely deleted.
  if (!company.hubspotDeletedAt && company.crmDeletedReason === "archived") {
    throw new ValidationError(
      [{ path: ["company"], message: "company is archived in the CRM, not deleted" }],
      "This company is archived in monday, not deleted. Archiving is reversible — delete it in monday if you really mean to remove it here."
    );
  }
  return db.transaction(async tx => {
    const documents = await hardDeleteDocumentsByCompanyId(company.id, tx);
    const deals = await deleteDealsByCompanyId(company.hubspotCompanyId, tx);
    await deleteCompanyByHubspotId(company.hubspotCompanyId, tx);
    return {
      id: company.id,
      name: company.name,
      hubspotCompanyId: company.hubspotCompanyId,
      documents,
      deals
    };
  });
}
