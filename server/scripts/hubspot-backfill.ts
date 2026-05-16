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

import { sql } from "drizzle-orm";
import { db, pool } from "../db/client";
import { companies as companiesTable } from "../db/schema";
import { upsertCompany } from "../modules/companies/companies.repository";
import { upsertDeal } from "../modules/deals/deals.repository";
import { hubspot } from "../modules/hubspot/hubspot.client";
import {
  mapHubspotCompanyToRow,
  mapHubspotDealToRow
} from "../modules/hubspot/hubspot.mapper";
import { logger } from "../middleware/logger";

const PAGE_SIZE = 100;

interface BackfillStats {
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
  const stats: BackfillStats = {
    companies: { fetched: 0, upserted: 0, skipped: 0 },
    deals: { fetched: 0, upserted: 0, skipped: 0 },
    durationMs: 0
  };

  // ─── Companies first ─────────────────────────────────────────────
  logger.info("[hubspot:backfill] companies pass starting");
  let cursor: string | undefined = undefined;
  do {
    const page = await hubspot.listCompanies(cursor, PAGE_SIZE);
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
      try {
        await upsertDeal(row);
        stats.deals.upserted += 1;
      } catch (err) {
        stats.deals.skipped += 1;
        const message = (err as Error).message;
        // FK violation (deal references a company we don't have) =>
        // orphan deal in HubSpot. Log + count as skip.
        if (message.includes("foreign key constraint")) {
          logger.warn(
            { hubspotDealId: row.hubspotDealId, hubspotCompanyId: row.hubspotCompanyId },
            "[hubspot:backfill] deal upsert: company FK missing, skipped"
          );
        } else {
          logger.warn(
            { hubspotDealId: row.hubspotDealId, err: message },
            "[hubspot:backfill] deal upsert failed"
          );
        }
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
