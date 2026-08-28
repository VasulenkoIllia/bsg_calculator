#!/usr/bin/env tsx
/**
 * One-shot HubSpot backfill.
 *
 * Paginates every Company and every Deal from the configured HubSpot
 * tenant + upserts each into our DB. Idempotent — safe to re-run.
 *
 * Usage:
 *   npm run hubspot:backfill
 *
 * Auto-run trigger: server/index.ts will invoke runBackfill() at
 * startup when `HUBSPOT_AUTO_BACKFILL=true` AND the companies table
 * is empty. See backendStartupBackfillIfEmpty.
 *
 * Order:
 *   1. cleanupNonMatching — drop existing rows that don't match the
 *      active company_type filter (deals first due to FK RESTRICT).
 *   2. backfillCompanies — paginate + upsert filtered companies.
 *   3. backfillDeals — paginate + upsert ALL deals; resolves
 *      company FK with primary-then-fallback policy.
 *
 * Failure semantics:
 *   - Each pass is independently best-effort. If the deals pass
 *     fails halfway, companies are already upserted; re-running
 *     the script picks up where it left off (upsert is idempotent).
 *   - Per-row errors are logged + counted but don't abort the loop.
 */

import { and, ne, sql } from "drizzle-orm";
import { env } from "../config/env";
import { db, pool } from "../db/client";
import { companies as companiesTable } from "../db/schema";
import { upsertCompany } from "../modules/companies/companies.repository";
import { upsertDeal } from "../modules/deals/deals.repository";
import { hubspot } from "../modules/hubspot/hubspot.client";
import {
  extractDealCompanyCandidates,
  mapHubspotCompanyToRow,
  mapHubspotDealToRow
} from "../modules/hubspot/hubspot.mapper";
import type { HubspotListResponse } from "../modules/hubspot/hubspot.types";
import { logger } from "../middleware/logger";

const PAGE_SIZE = env.HUBSPOT_BACKFILL_PAGE_SIZE;

interface BackfillStats {
  /** Active company_type filter (empty = no filter / pull all). */
  companyTypeFilter: string;
  /** Cleanup pass: how many non-matching rows we deleted before pull. */
  cleanup: { companiesDeleted: number; dealsDeleted: number };
  companies: { fetched: number; upserted: number; skipped: number };
  deals: { fetched: number; upserted: number; skipped: number };
  durationMs: number;
}

// ────────────────────────────────────────────────────────────────────
// Pass 1: cleanup
// ────────────────────────────────────────────────────────────────────

interface CleanupResult {
  companiesDeleted: number;
  dealsDeleted: number;
}

/**
 * Above this many `referring_partner` rows, the cleanup pass refuses to
 * run at all. Three is the count that existed before the monday
 * migration began (2026-08-27) — anything more means the Agents board is
 * being cached and the pass would destroy it.
 */
const AGENT_ROW_CLEANUP_LIMIT = 3;

/**
 * Remove existing rows that don't match the active company_type
 * filter. Deals first (FK RESTRICT requires that order).
 * No-op when the filter is empty.
 */
async function cleanupNonMatching(filter: string): Promise<CleanupResult> {
  if (filter.length === 0) {
    return { companiesDeleted: 0, dealsDeleted: 0 };
  }

  // ─── SAFETY BRAKE (monday migration, 2026-08-27) ─────────────────
  // This pass DELETES every company whose company_type != filter. That
  // was safe while the only thing in the table was `direct_client` rows
  // pulled by this very script. It stops being safe the moment the
  // monday sync starts caching the Agents (A) board, because those rows
  // are `referring_partner` by design and this pass would wipe ~40 of
  // them — together with their calculator_configs, which cascade.
  //
  // Refuse rather than trust an env var: the filter lives in .env on the
  // server and nobody re-reads it before running a backfill by hand.
  const agentRows = await db.execute<{ count: number }>(
    sql`SELECT count(*)::int AS count FROM companies WHERE company_type = 'referring_partner'`
  );
  const agentCount = Number(agentRows.rows[0]?.count ?? 0);
  if (agentCount > AGENT_ROW_CLEANUP_LIMIT) {
    logger.error(
      { agentCount, limit: AGENT_ROW_CLEANUP_LIMIT, filter },
      "[hubspot:backfill] cleanup pass REFUSED — the table holds agent rows that this pass would delete. " +
        "This is expected once monday is syncing the Agents board; the cleanup pass is obsolete then. " +
        "Run the backfill with HUBSPOT_COMPANY_TYPE_FILTER='' to skip it."
    );
    return { companiesDeleted: 0, dealsDeleted: 0 };
  }

  logger.info({ filter }, "[hubspot:backfill] cleanup pass — removing non-matching rows");

  // All three steps SKIP any company that owns documents (NOT EXISTS …
  // documents). A `company.merge` survivor can be a filtered-out type
  // that INHERITED the merged-away company's documents (the merge handler
  // re-points docs onto the survivor regardless of company_type). Deleting
  // such a company would FK-RESTRICT-fail (documents.company_id is ON
  // DELETE RESTRICT) and abort the whole cleanup pass — so we never
  // attempt it. Document-owning companies are kept; they are legitimate
  // parents of legal records.

  // Step 1: delete deals whose company is about to be removed.
  const orphanedDealsResult = await db.execute(sql`
    DELETE FROM deals
    WHERE hubspot_company_id IN (
      SELECT c.hubspot_company_id FROM companies c
      WHERE c.company_type IS DISTINCT FROM ${filter}
        AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.company_id = c.id)
        AND NOT EXISTS (SELECT 1 FROM calculator_configs k WHERE k.company_id = c.id)
    )
    RETURNING hubspot_deal_id
  `);
  const dealsDeleted = orphanedDealsResult.rowCount ?? 0;

  // Step 2: delete non-matching companies (covers explicit non-match),
  // except those that own documents.
  const removedCompanies = await db
    .delete(companiesTable)
    .where(
      and(
        ne(companiesTable.companyType, filter),
        sql`NOT EXISTS (SELECT 1 FROM documents d WHERE d.company_id = ${companiesTable.id})`,
        // calculator_configs.company_id is ON DELETE CASCADE, so without
        // this guard a client whose operator has saved a calculator but
        // not yet produced a document loses that work silently and
        // uncounted. The documents-only guard never covered them.
        sql`NOT EXISTS (SELECT 1 FROM calculator_configs k WHERE k.company_id = ${companiesTable.id})`
      )
    )
    .returning({ id: companiesTable.id });
  let companiesDeleted = removedCompanies.length;

  // Step 3: also remove records with NULL company_type — ne() ignores
  // NULLs — again skipping any that own documents.
  const removedNullType = await db.execute(sql`
    DELETE FROM companies
    WHERE company_type IS NULL
      AND NOT EXISTS (SELECT 1 FROM documents d WHERE d.company_id = companies.id)
      AND NOT EXISTS (SELECT 1 FROM calculator_configs k WHERE k.company_id = companies.id)
    RETURNING id
  `);
  companiesDeleted += removedNullType.rowCount ?? 0;

  logger.info({ companiesDeleted, dealsDeleted }, "[hubspot:backfill] cleanup pass complete");
  return { companiesDeleted, dealsDeleted };
}

// ────────────────────────────────────────────────────────────────────
// Pass 2: companies
// ────────────────────────────────────────────────────────────────────

interface PassResult {
  fetched: number;
  upserted: number;
  skipped: number;
}

/**
 * Paginate companies (filtered by company_type when configured) and
 * upsert each. Mapper drops rows missing required fields (name,
 * timestamps); upsert failures are caught + counted.
 */
async function backfillCompanies(filter: string): Promise<PassResult> {
  logger.info(
    { filter: filter || "(none — pulling all)" },
    "[hubspot:backfill] companies pass starting"
  );
  const result: PassResult = { fetched: 0, upserted: 0, skipped: 0 };

  let cursor: string | undefined;
  do {
    const page: HubspotListResponse =
      filter.length > 0
        ? await hubspot.searchCompaniesByType(filter, cursor, PAGE_SIZE)
        : await hubspot.listCompanies(cursor, PAGE_SIZE);
    result.fetched += page.results.length;

    for (const obj of page.results) {
      const row = mapHubspotCompanyToRow(obj);
      if (!row) {
        result.skipped += 1;
        continue;
      }
      try {
        await upsertCompany(row);
        result.upserted += 1;
      } catch (err) {
        result.skipped += 1;
        logger.warn(
          { hubspotCompanyId: row.hubspotCompanyId, err: (err as Error).message },
          "[hubspot:backfill] company upsert failed"
        );
      }
    }

    // Progress log every 500 rows. Skip when this is the last page;
    // the "pass complete" log outside the loop carries the same data.
    if (result.fetched % 500 === 0 && page.paging?.next?.after) {
      logger.info({ ...result }, "[hubspot:backfill] companies progress");
    }
    cursor = page.paging?.next?.after;
  } while (cursor);

  logger.info({ ...result }, "[hubspot:backfill] companies pass complete");
  return result;
}

// ────────────────────────────────────────────────────────────────────
// Pass 3: deals
// ────────────────────────────────────────────────────────────────────

/**
 * Build an in-memory Set of every hubspot_company_id currently in
 * our DB. Used by the deals loop to resolve FK candidates in O(1)
 * instead of issuing one SELECT per deal.
 *
 * The set is loaded once at the start of the deals pass — companies
 * inserted DURING the deals pass aren't included, which is fine
 * because companies pass already ran to completion before us.
 */
async function loadKnownCompanyIds(): Promise<Set<string>> {
  const rows = await db
    .select({ id: companiesTable.hubspotCompanyId })
    .from(companiesTable);
  return new Set(rows.map(r => r.id));
}

/**
 * Resolve the company FK for a deal. Iterates the ordered candidate
 * list (primary first) and picks the first id present in the
 * `knownCompanyIds` set. Returns `null` for orphan deals.
 *
 * When a non-primary candidate is chosen, the caller logs a warn so
 * BSG sales can spot deals where the primary-association in HubSpot
 * UI is wrong (e.g. set to an Agent instead of the Merchant).
 */
function resolveDealCompanyFromSet(
  candidates: string[],
  knownCompanyIds: Set<string>
): string | null {
  for (const candidate of candidates) {
    if (knownCompanyIds.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Paginate ALL deals and upsert each. Company FK resolved against an
 * in-memory Set of known company ids (loaded once up-front) so we
 * avoid an N+1 query pattern.
 */
async function backfillDeals(): Promise<PassResult> {
  logger.info("[hubspot:backfill] deals pass starting");
  const result: PassResult = { fetched: 0, upserted: 0, skipped: 0 };

  const knownCompanyIds = await loadKnownCompanyIds();
  logger.info(
    { knownCompanies: knownCompanyIds.size },
    "[hubspot:backfill] deals pass: pre-loaded known company ids"
  );

  let cursor: string | undefined;
  do {
    const page = await hubspot.listDeals(cursor, PAGE_SIZE);
    result.fetched += page.results.length;

    for (const obj of page.results) {
      const row = mapHubspotDealToRow(obj);
      if (!row) {
        result.skipped += 1;
        continue;
      }

      const candidates = extractDealCompanyCandidates(obj);
      const chosenCompanyId = resolveDealCompanyFromSet(candidates, knownCompanyIds);

      if (!chosenCompanyId) {
        result.skipped += 1;
        logger.warn(
          { hubspotDealId: row.hubspotDealId, candidates },
          "[hubspot:backfill] deal skipped: no associated company present in DB"
        );
        continue;
      }

      if (chosenCompanyId !== candidates[0]) {
        logger.warn(
          {
            hubspotDealId: row.hubspotDealId,
            dealName: row.name,
            primaryCompany: candidates[0],
            chosenCompany: chosenCompanyId,
            allCandidates: candidates
          },
          "[hubspot:backfill] deal: primary-association is filtered out, using fallback. Sales should fix primary in HubSpot."
        );
      }

      row.hubspotCompanyId = chosenCompanyId;

      try {
        await upsertDeal(row);
        result.upserted += 1;
      } catch (err) {
        result.skipped += 1;
        logger.warn(
          { hubspotDealId: row.hubspotDealId, err: (err as Error).message },
          "[hubspot:backfill] deal upsert failed"
        );
      }
    }

    // Progress log every 500 rows. Skip when this is the last page;
    // the "pass complete" log outside the loop carries the same data.
    if (result.fetched % 500 === 0 && page.paging?.next?.after) {
      logger.info({ ...result }, "[hubspot:backfill] deals progress");
    }
    cursor = page.paging?.next?.after;
  } while (cursor);

  logger.info({ ...result }, "[hubspot:backfill] deals pass complete");
  return result;
}

// ────────────────────────────────────────────────────────────────────
// Orchestrator
// ────────────────────────────────────────────────────────────────────

export async function runBackfill(): Promise<BackfillStats> {
  // See reconcile-companies.ts for the reasoning: HUBSPOT_API_TOKEN
  // survives the flip (the runbook only ever appends to the live .env),
  // so this stays runnable in the monday era and would write HubSpot's
  // view straight over monday-era rows.
  if (env.CRM_PROVIDER !== "hubspot" && !process.argv.includes("--force-hubspot-era")) {
    throw new Error(
      `CRM_PROVIDER is "${env.CRM_PROVIDER}", not "hubspot" — refusing to backfill monday-era data from HubSpot. Pass --force-hubspot-era only when deliberately rolling back.`
    );
  }
  if (!hubspot.isConfigured()) {
    throw new Error(
      "HUBSPOT_API_TOKEN is not set. Add it to .env before running backfill."
    );
  }

  const started = Date.now();
  const filter = env.HUBSPOT_COMPANY_TYPE_FILTER.trim();

  const cleanup = await cleanupNonMatching(filter);
  const companies = await backfillCompanies(filter);
  const deals = await backfillDeals();

  return {
    companyTypeFilter: filter,
    cleanup,
    companies,
    deals,
    durationMs: Date.now() - started
  };
}

// Export private helpers for unit-testing.
export const __internals = {
  cleanupNonMatching,
  backfillCompanies,
  backfillDeals,
  resolveDealCompanyFromSet,
  loadKnownCompanyIds
};

// ────────────────────────────────────────────────────────────────────
// Server-startup hook
// ────────────────────────────────────────────────────────────────────

/**
 * Conditions for auto-run:
 *   - HUBSPOT_AUTO_BACKFILL env var is `true`
 *   - HUBSPOT_API_TOKEN is configured
 *   - The companies table has zero rows
 *
 * Non-blocking — kicked off via setImmediate so /health responds
 * immediately. If backfill fails the server stays up (degraded
 * mode — operator gets empty listings until manual re-run).
 */
export async function backendStartupBackfillIfEmpty(): Promise<void> {
  if (!env.HUBSPOT_AUTO_BACKFILL) return;
  // A startup backfill in the monday era would re-import HubSpot's view of
  // every company on each boot. Silent, automatic and provider-blind is
  // the worst combination of the three, so gate it here rather than
  // relying on the operator having also cleared the token.
  if (env.CRM_PROVIDER !== "hubspot") {
    logger.warn(
      { crmProvider: env.CRM_PROVIDER },
      "[hubspot:backfill] HUBSPOT_AUTO_BACKFILL is on but the active CRM is not HubSpot — skipping the startup backfill"
    );
    return;
  }
  if (!hubspot.isConfigured()) {
    logger.warn(
      "[hubspot:backfill] HUBSPOT_AUTO_BACKFILL=true but no token configured — skipping"
    );
    return;
  }

  const { rows } = await db.execute(sql`SELECT count(*)::int AS n FROM companies`);
  const count = Number((rows[0] as { n: number } | undefined)?.n ?? 0);
  if (count > 0) {
    logger.info({ count }, "[hubspot:backfill] companies already present, auto-run skipped");
    return;
  }

  logger.info("[hubspot:backfill] companies table empty — auto-run starting in background");
  setImmediate(() => {
    void (async () => {
      try {
        const stats = await runBackfill();
        logger.info({ stats }, "[hubspot:backfill] auto-run complete");
      } catch (err) {
        logger.error(
          { err: (err as Error).message },
          "[hubspot:backfill] auto-run failed"
        );
      }
    })();
  });
}

// ────────────────────────────────────────────────────────────────────
// CLI entrypoint
// ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    const stats = await runBackfill();
    // eslint-disable-next-line no-console
    console.log("\n[hubspot:backfill] done.");
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(stats, null, 2));
  } finally {
    await pool.end();
  }
}

// Only run when executed directly (tsx scripts/.../hubspot-backfill.ts),
// NOT when imported by server/index.ts or tests.
const isMain =
  process.argv[1]?.endsWith("hubspot-backfill.ts") ||
  process.argv[1]?.endsWith("hubspot-backfill.js");
if (isMain) {
  main().catch(err => {
    // eslint-disable-next-line no-console
    console.error("[hubspot:backfill] failed:", err);
    process.exit(1);
  });
}
