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
 *   1. Companies first (deals.hubspot_company_id has a FK).
 *   2. Then deals; mapper drops orphan deals where the company
 *      isn't in our cache.
 */

import { ne, sql } from "drizzle-orm";
import { env } from "../config/env";
import { db, pool } from "../db/client";
import { companies as companiesTable } from "../db/schema";
import { findCompanyByHubspotId } from "../modules/companies/companies.repository";
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

const PAGE_SIZE = 100;

interface BackfillStats {
  /** Active company_type filter (empty = no filter / pull all). */
  companyTypeFilter: string;
  /** Cleanup pass: how many non-matching rows we deleted before pull. */
  cleanup: { companiesDeleted: number; dealsDeleted: number };
  companies: { fetched: number; upserted: number; skipped: number };
  deals: { fetched: number; upserted: number; skipped: number };
  durationMs: number;
}

export async function runBackfill(): Promise<BackfillStats> {
  if (!hubspot.isConfigured()) {
    throw new Error(
      "HUBSPOT_API_TOKEN is not set. Add it to .env before running backfill."
    );
  }

  const started = Date.now();
  const filter = env.HUBSPOT_COMPANY_TYPE_FILTER.trim();
  const stats: BackfillStats = {
    companyTypeFilter: filter,
    cleanup: { companiesDeleted: 0, dealsDeleted: 0 },
    companies: { fetched: 0, upserted: 0, skipped: 0 },
    deals: { fetched: 0, upserted: 0, skipped: 0 },
    durationMs: 0
  };

  // ─── Cleanup pass ────────────────────────────────────────────────
  // If a filter is active, drop any existing rows that no longer
  // match it. Deals first (FK RESTRICT → must be deleted before
  // their parent company). Without this pass the DB would slowly
  // accumulate stale "wrong-type" rows from previous loose runs.
  if (filter.length > 0) {
    logger.info({ filter }, "[hubspot:backfill] cleanup pass — removing non-matching rows");

    // Delete deals whose company is about to be removed.
    const orphanedDealsResult = await db.execute(sql`
      DELETE FROM deals
      WHERE hubspot_company_id IN (
        SELECT hubspot_company_id FROM companies
        WHERE company_type IS DISTINCT FROM ${filter}
      )
      RETURNING hubspot_deal_id
    `);
    stats.cleanup.dealsDeleted = orphanedDealsResult.rowCount ?? 0;

    // Then delete non-matching companies themselves.
    const removedCompanies = await db
      .delete(companiesTable)
      .where(ne(companiesTable.companyType, filter))
      .returning({ id: companiesTable.id });
    stats.cleanup.companiesDeleted = removedCompanies.length;

    // Also handle the NULL case (records with no company_type) —
    // ne() on a NULLABLE column doesn't match NULLs, so be explicit.
    const removedNullType = await db.execute(sql`
      DELETE FROM companies WHERE company_type IS NULL RETURNING id
    `);
    stats.cleanup.companiesDeleted += removedNullType.rowCount ?? 0;

    logger.info(
      { ...stats.cleanup },
      "[hubspot:backfill] cleanup pass complete"
    );
  }

  // ─── Companies pass ──────────────────────────────────────────────
  logger.info(
    { filter: filter || "(none — pulling all)" },
    "[hubspot:backfill] companies pass starting"
  );
  let cursor: string | undefined = undefined;
  do {
    const page: HubspotListResponse =
      filter.length > 0
        ? await hubspot.searchCompaniesByType(filter, cursor, PAGE_SIZE)
        : await hubspot.listCompanies(cursor, PAGE_SIZE);
    stats.companies.fetched += page.results.length;
    for (const obj of page.results) {
      const row = mapHubspotCompanyToRow(obj);
      if (!row) {
        stats.companies.skipped += 1;
        continue;
      }
      try {
        await upsertCompany(row);
        stats.companies.upserted += 1;
      } catch (err) {
        stats.companies.skipped += 1;
        logger.warn(
          {
            hubspotCompanyId: row.hubspotCompanyId,
            err: (err as Error).message
          },
          "[hubspot:backfill] company upsert failed"
        );
      }
    }
    if (stats.companies.fetched % 500 === 0 || !page.paging?.next?.after) {
      logger.info(
        {
          fetched: stats.companies.fetched,
          upserted: stats.companies.upserted,
          skipped: stats.companies.skipped
        },
        "[hubspot:backfill] companies progress"
      );
    }
    cursor = page.paging?.next?.after;
  } while (cursor);
  logger.info(
    {
      fetched: stats.companies.fetched,
      upserted: stats.companies.upserted,
      skipped: stats.companies.skipped
    },
    "[hubspot:backfill] companies pass complete"
  );

  // ─── Deals next ──────────────────────────────────────────────────
  logger.info("[hubspot:backfill] deals pass starting");
  cursor = undefined;
  do {
    const page = await hubspot.listDeals(cursor, PAGE_SIZE);
    stats.deals.fetched += page.results.length;
    for (const obj of page.results) {
      const row = mapHubspotDealToRow(obj);
      if (!row) {
        stats.deals.skipped += 1;
        continue;
      }

      // Smart company resolution: HubSpot's primary association may
      // point at an Agent that's been filtered out of our DB.
      // Iterate ALL candidate company IDs (primary first, then
      // secondary) and pick the first that exists locally.
      const candidates = extractDealCompanyCandidates(obj);
      let chosenCompanyId: string | null = null;
      for (const candidate of candidates) {
        const exists = await findCompanyByHubspotId(candidate);
        if (exists) {
          chosenCompanyId = candidate;
          break;
        }
      }

      if (!chosenCompanyId) {
        stats.deals.skipped += 1;
        logger.warn(
          { hubspotDealId: row.hubspotDealId, candidates },
          "[hubspot:backfill] deal skipped: no associated company present in DB"
        );
        continue;
      }

      // If the chosen company is NOT the primary, log a warn so
      // BSG sales can spot deals where primary-association points
      // at an Agent and re-assign in the HubSpot UI.
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

      // Override the company id on the row before upsert.
      row.hubspotCompanyId = chosenCompanyId;

      try {
        await upsertDeal(row);
        stats.deals.upserted += 1;
      } catch (err) {
        stats.deals.skipped += 1;
        logger.warn(
          { hubspotDealId: row.hubspotDealId, err: (err as Error).message },
          "[hubspot:backfill] deal upsert failed"
        );
      }
    }
    if (stats.deals.fetched % 500 === 0 || !page.paging?.next?.after) {
      logger.info(
        {
          fetched: stats.deals.fetched,
          upserted: stats.deals.upserted,
          skipped: stats.deals.skipped
        },
        "[hubspot:backfill] deals progress"
      );
    }
    cursor = page.paging?.next?.after;
  } while (cursor);
  logger.info(
    {
      fetched: stats.deals.fetched,
      upserted: stats.deals.upserted,
      skipped: stats.deals.skipped
    },
    "[hubspot:backfill] deals pass complete"
  );

  stats.durationMs = Date.now() - started;
  return stats;
}

/**
 * Server-startup hook (called from server/index.ts).
 *
 * Conditions for auto-run:
 *   - HUBSPOT_AUTO_BACKFILL env var is `true`
 *   - HUBSPOT_API_TOKEN is configured
 *   - The companies table has zero rows
 *
 * Non-blocking — kicked off via setImmediate so /health responds
 * immediately and the operator can observe progress in pino logs.
 * If backfill fails the server stays up (degraded — operator gets
 * empty listings until they run the script manually).
 */
export async function backendStartupBackfillIfEmpty(): Promise<void> {
  if (process.env.HUBSPOT_AUTO_BACKFILL !== "true") return;
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
  setImmediate(async () => {
    try {
      const stats = await runBackfill();
      logger.info({ stats }, "[hubspot:backfill] auto-run complete");
    } catch (err) {
      logger.error({ err: (err as Error).message }, "[hubspot:backfill] auto-run failed");
    }
  });
  void companiesTable; // silence unused-import warning if any
}

// ─── CLI entrypoint ─────────────────────────────────────────────────

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
// NOT when imported by server/index.ts.
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
