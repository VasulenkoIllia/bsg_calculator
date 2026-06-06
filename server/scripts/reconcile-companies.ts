#!/usr/bin/env tsx
/**
 * Reconcile the local companies cache against HubSpot — find + repair
 * DRIFT (local companies that no longer exist in HubSpot).
 *
 * Drift happens when a `company.merge` / `company.deletion` webhook was
 * never applied — e.g. it predates the merge handler, or arrived during
 * webhook downtime. The lingering row then 404s on every TTL refresh
 * and 400s on every Note association (the original "(M) TEST 1 c"
 * symptom, hubspot id 430570099930).
 *
 * Going forward the `company.merge` webhook handler prevents new drift;
 * this script is the manual, operator-reviewed safety net for the
 * backlog + any future missed event. It is intentionally NOT wired into
 * the auto-run backfill: an automatic "delete everything not in the
 * fetch" prune would wrongly delete real companies on a partial/rate-
 * limited HubSpot fetch. Here the operator reviews the dry-run first.
 *
 * Modes:
 *   (default)        dry-run — list drifted companies + doc/deal counts
 *                    + the recommended action per row.
 *   --prune-empty    delete drifted companies that own ZERO documents
 *                    (deals first, then company, in one TX). Never
 *                    touches a company that owns documents.
 *   --repoint A B    fold drifted company A into surviving company B —
 *                    re-points A's documents/configs/deals onto B then
 *                    removes A (same path as a live company.merge).
 *
 * Finding the survivor id (B) for --repoint: open the drifted company in
 * the HubSpot UI — a merged record redirects to its surviving company,
 * whose id is the <toHubspotId>. (HubSpot also lists the absorbed records
 * under the survivor's "merged records" history.) The merge webhook that
 * caused the drift is NOT in our event log for pre-fix drift (those
 * batches were dropped before this change), so we can't auto-derive it.
 *
 * Run on prod:
 *   docker compose exec app npx tsx server/scripts/reconcile-companies.ts
 *   docker compose exec app npx tsx server/scripts/reconcile-companies.ts --prune-empty
 *   docker compose exec app npx tsx server/scripts/reconcile-companies.ts --repoint 430570099930 <survivorHubspotId>
 */

import { db, pool } from "../db/client";
import { companies as companiesTable, type Company } from "../db/schema";
import { logger } from "../middleware/logger";
import { hubspot, isHubspotNotFound } from "../modules/hubspot/hubspot.client";
import { countDocumentsByCompanyId } from "../modules/documents/documents.repository";
import {
  countDealsByCompanyHubspotId,
  deleteDealsByCompanyId
} from "../modules/deals/deals.repository";
import {
  deleteCompanyByHubspotId,
  findCompanyByHubspotId
} from "../modules/companies/companies.repository";
import { handleCompanyMerge } from "../modules/companies/companies.merge.service";

interface DriftedCompany {
  company: Company;
  documents: number;
  deals: number;
}

/**
 * Probe every local company against HubSpot. A 404 (NotFoundError) =
 * drifted. Any other error (token/transient) ABORTS the scan so we
 * never misclassify a reachability blip as drift. O(N) GETs — fine for
 * BSG's tenant size; this is a one-off ops tool.
 */
async function findDriftedCompanies(): Promise<DriftedCompany[]> {
  const localCompanies = await db.select().from(companiesTable);
  const drifted: DriftedCompany[] = [];
  for (const company of localCompanies) {
    let present = true;
    try {
      await hubspot.getCompany(company.hubspotCompanyId);
    } catch (err) {
      // A 404 (any shape) means the company is gone upstream → drift.
      // Transient/auth errors (401/403/429/5xx) re-throw to abort the
      // scan so we never misclassify a blip as drift.
      if (isHubspotNotFound(err)) present = false;
      else throw err;
    }
    if (present) continue;
    const documents = await countDocumentsByCompanyId(company.id);
    const deals = await countDealsByCompanyHubspotId(company.hubspotCompanyId);
    drifted.push({ company, documents, deals });
  }
  return drifted;
}

async function repoint(fromHubspotId: string, toHubspotId: string): Promise<void> {
  if (fromHubspotId === toHubspotId) {
    throw new Error("--repoint <from> <to>: the two ids must differ");
  }
  // Confirm the survivor (to) actually exists before re-pointing onto it —
  // otherwise handleCompanyMerge logs + silently no-ops and the operator
  // would see "complete" without anything having moved.
  const survivorCached = await findCompanyByHubspotId(toHubspotId);
  if (!survivorCached) {
    try {
      await hubspot.getCompany(toHubspotId);
    } catch (err) {
      if (isHubspotNotFound(err)) {
        throw new Error(
          `survivor company ${toHubspotId} not found in HubSpot or local cache — pick a company that still exists`
        );
      }
      throw err;
    }
  }
  // Warn (don't fail) if the drifted source is already gone locally.
  const source = await findCompanyByHubspotId(fromHubspotId);
  if (!source) {
    // eslint-disable-next-line no-console
    console.log(
      `[reconcile] note: ${fromHubspotId} is not in the local cache (already removed?) — nothing to re-point.`
    );
  }
  // eslint-disable-next-line no-console
  console.log(
    `[reconcile] re-pointing ${fromHubspotId} → ${toHubspotId} (documents/configs/deals follow the survivor)…`
  );
  await handleCompanyMerge(toHubspotId, [fromHubspotId]);
  // eslint-disable-next-line no-console
  console.log("[reconcile] re-point complete.");
}

async function scan(prune: boolean): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(
    `[reconcile] scanning local companies for HubSpot drift${prune ? " (PRUNE-EMPTY)" : " (dry-run)"}…`
  );
  let drifted: DriftedCompany[];
  try {
    drifted = await findDriftedCompanies();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[reconcile] scan aborted on a non-404 HubSpot error (likely a transient outage or invalid token): ${msg}. No changes were made — fix the upstream issue and re-run.`
    );
  }

  if (drifted.length === 0) {
    // eslint-disable-next-line no-console
    console.log("[reconcile] no drift — every local company still exists in HubSpot.");
    return;
  }

  // eslint-disable-next-line no-console
  console.log(
    `\n[reconcile] ${drifted.length} drifted compan${drifted.length === 1 ? "y" : "ies"} (gone from HubSpot):\n`
  );
  for (const d of drifted) {
    const action =
      d.documents > 0
        ? `REPOINT — owns ${d.documents} document(s); run: --repoint ${d.company.hubspotCompanyId} <survivorHubspotId>`
        : prune
          ? "PRUNING (no documents)"
          : "prune-safe (no documents); run: --prune-empty";
    // eslint-disable-next-line no-console
    console.log(
      `  • ${d.company.name}  [hs ${d.company.hubspotCompanyId} · uuid ${d.company.id}]  docs=${d.documents} deals=${d.deals}\n      → ${action}`
    );
  }

  if (!prune) {
    // eslint-disable-next-line no-console
    console.log(
      "\n[reconcile] dry-run only. Re-run with --prune-empty to delete the no-document drift, or --repoint <from> <to> to fold a with-document company into its survivor."
    );
    return;
  }

  let pruned = 0;
  let skipped = 0;
  for (const d of drifted) {
    if (d.documents > 0) {
      skipped += 1;
      logger.warn(
        { hubspotCompanyId: d.company.hubspotCompanyId, documents: d.documents },
        "[reconcile] skipping prune — company owns documents; use --repoint"
      );
      continue;
    }
    await db.transaction(async tx => {
      await deleteDealsByCompanyId(d.company.hubspotCompanyId, tx);
      await deleteCompanyByHubspotId(d.company.hubspotCompanyId, tx);
    });
    pruned += 1;
    // eslint-disable-next-line no-console
    console.log(`  ✓ pruned ${d.company.name} [${d.company.hubspotCompanyId}]`);
  }
  // eslint-disable-next-line no-console
  console.log(
    `\n[reconcile] prune complete: ${pruned} removed, ${skipped} skipped (own documents → use --repoint).`
  );
}

async function main(): Promise<void> {
  try {
    if (!hubspot.isConfigured()) {
      throw new Error("HUBSPOT_API_TOKEN is not set. Add it to .env before running reconcile.");
    }
    const args = process.argv.slice(2);

    const repointIdx = args.indexOf("--repoint");
    if (repointIdx !== -1) {
      const from = args[repointIdx + 1];
      const to = args[repointIdx + 2];
      if (!from || !to) {
        throw new Error("--repoint requires two ids: --repoint <fromHubspotId> <toHubspotId>");
      }
      await repoint(from, to);
      return;
    }

    await scan(args.includes("--prune-empty"));
  } finally {
    // Await the pool close so connections drain before the process exits
    // (matches hubspot-backfill.ts / create-user.ts).
    await pool.end();
  }
}

// Exported for integration testing. The drift scan + --prune-empty path
// delete prod data, so they are covered directly (see
// server/tests/reconcile-companies.integration.test.ts).
export const __internals = { findDriftedCompanies, scan, repoint };

const isMain =
  process.argv[1]?.endsWith("reconcile-companies.ts") ||
  process.argv[1]?.endsWith("reconcile-companies.js");
if (isMain) {
  main().catch(err => {
    // eslint-disable-next-line no-console
    console.error("[reconcile] failed:", err);
    process.exit(1);
  });
}
