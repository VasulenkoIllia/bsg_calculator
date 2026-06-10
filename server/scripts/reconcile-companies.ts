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
 *                    + the recommended action per row. Flags MERGED-AWAY
 *                    aliases separately (HubSpot resolves them to a
 *                    survivor, so they never 404).
 *   --fix-merged [--yes]
 *                    auto-fold every MERGED-AWAY alias into its survivor
 *                    (the survivor id comes from HubSpot's redirect, so no
 *                    manual lookup). Previews unless --yes. This is the fix
 *                    for "HubSpot shows 1 company, our list shows 2".
 *   --prune-empty    delete drifted companies that own ZERO documents
 *                    (deals first, then company, in one TX). Never
 *                    touches a company that owns documents.
 *   --repoint A B    fold drifted company A into surviving company B —
 *                    re-points A's documents/configs/deals onto B then
 *                    removes A (same path as a live company.merge).
 *   --purge A [--yes] permanently delete drifted company A together with
 *                    its documents/configs/deals — for a company DELETED
 *                    upstream (no survivor to re-point onto). Refuses if A
 *                    still exists in HubSpot; previews unless --yes given.
 *   --mark           RETROACTIVELY flag every document-owning drifted
 *                    company as deleted-from-HubSpot (= what the
 *                    company.deletion webhook now does). Use this for
 *                    PRE-FIX drift whose deletion event already `failed`
 *                    before the marker existed — afterwards those companies
 *                    show the "Deleted in HubSpot" badge + the admin
 *                    "Delete from system" button so the whole flow is
 *                    visible in the UI. (No-doc drift → use --prune-empty.)
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
import {
  countDocumentsByCompanyId,
  hardDeleteDocumentsByCompanyId
} from "../modules/documents/documents.repository";
import {
  countDealsByCompanyHubspotId,
  deleteDealsByCompanyId
} from "../modules/deals/deals.repository";
import {
  deleteCompanyByHubspotId,
  findCompanyByHubspotId,
  markCompanyHubspotDeleted
} from "../modules/companies/companies.repository";
import { handleCompanyMerge } from "../modules/companies/companies.merge.service";

interface DriftedCompany {
  company: Company;
  documents: number;
  deals: number;
  /**
   * Set when this local row is a MERGED-AWAY ALIAS (HubSpot returned a
   * survivor with a different id) rather than a deleted/404 company.
   * Holds the survivor's HubSpot id — repoint straight into it.
   */
  mergedInto?: string;
}

/**
 * Probe every local company against HubSpot. Two kinds of drift:
 *
 *   - DELETED: `getCompany` 404s → the company is gone upstream.
 *   - MERGED-AWAY ALIAS: `getCompany` returns 200 BUT with a different
 *     `id` than we asked for. HubSpot resolves a merged-away id to its
 *     surviving record, so a merged company NEVER 404s — the plain
 *     404 check misses it, which is exactly how merge duplicates linger
 *     in our cache (HubSpot shows 1 company, we show 2). The survivor is
 *     the returned `obj.id`, so we can auto-repoint without an operator
 *     having to hunt the survivor id by hand.
 *
 * Any other error (token/transient) ABORTS the scan so we never
 * misclassify a reachability blip as drift. O(N) GETs — fine for BSG's
 * tenant size; this is a one-off ops tool.
 */
async function findDriftedCompanies(): Promise<DriftedCompany[]> {
  const localCompanies = await db.select().from(companiesTable);
  const drifted: DriftedCompany[] = [];
  for (const company of localCompanies) {
    let present = true;
    let mergedInto: string | undefined;
    try {
      const obj = await hubspot.getCompany(company.hubspotCompanyId);
      // 200 but a different id → merged-away alias of obj.id (survivor).
      if (obj.id && obj.id !== company.hubspotCompanyId) {
        mergedInto = obj.id;
      }
    } catch (err) {
      if (isHubspotNotFound(err)) present = false;
      else throw err;
    }
    if (present && !mergedInto) continue; // genuinely live
    const documents = await countDocumentsByCompanyId(company.id);
    const deals = await countDealsByCompanyHubspotId(company.hubspotCompanyId);
    drifted.push({ company, documents, deals, mergedInto });
  }
  return drifted;
}

/**
 * Auto-fold every detected MERGED-AWAY alias into its survivor (we know
 * the survivor id from HubSpot's redirect, so no manual `--repoint`
 * lookup is needed). Companies that are DELETED (404, no survivor) are
 * left for --prune-empty / --mark / --purge. Idempotent.
 */
async function fixMerged(confirmed: boolean): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("[reconcile] scanning for merged-away company aliases…");
  let drifted: DriftedCompany[];
  try {
    drifted = await findDriftedCompanies();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[reconcile] scan aborted on a non-404 HubSpot error: ${msg}. No changes were made.`
    );
  }
  const merged = drifted.filter(d => d.mergedInto);
  if (merged.length === 0) {
    // eslint-disable-next-line no-console
    console.log("[reconcile] no merged-away aliases found.");
    return;
  }
  // eslint-disable-next-line no-console
  console.log(`\n[reconcile] ${merged.length} merged-away alias(es):\n`);
  for (const d of merged) {
    // eslint-disable-next-line no-console
    console.log(
      `  • ${d.company.name}  [hs ${d.company.hubspotCompanyId}]  docs=${d.documents} deals=${d.deals}  → fold into survivor ${d.mergedInto}`
    );
  }
  if (!confirmed) {
    // eslint-disable-next-line no-console
    console.log("\n[reconcile] DRY-RUN — re-run with --yes to fold them into their survivors.");
    return;
  }
  for (const d of merged) {
    await handleCompanyMerge(d.mergedInto!, [d.company.hubspotCompanyId]);
    // eslint-disable-next-line no-console
    console.log(`  ✓ folded ${d.company.name} [${d.company.hubspotCompanyId}] → ${d.mergedInto}`);
  }
  // eslint-disable-next-line no-console
  console.log(`\n[reconcile] fix-merged complete: ${merged.length} alias(es) folded into their survivors.`);
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

/**
 * Permanently delete a company that NO LONGER EXISTS in HubSpot, together
 * with its documents (their events cascade), deals, and calculator-configs
 * (cascade on company delete). For drift that is a DELETE upstream (not a
 * merge) — so there is no survivor to re-point onto. Typically leftover
 * test data.
 *
 * SAFETY: refuses unless HubSpot 404s the id (never deletes the documents
 * of a company that still exists upstream), and unless `--yes` is passed
 * (otherwise it only previews). IRREVERSIBLE.
 */
async function purge(hubspotId: string, confirmed: boolean): Promise<void> {
  const company = await findCompanyByHubspotId(hubspotId);
  if (!company) {
    // eslint-disable-next-line no-console
    console.log(`[reconcile] ${hubspotId} is not in the local cache — nothing to purge.`);
    return;
  }

  // Guard: only purge a company that is genuinely GONE from HubSpot.
  let existsUpstream = false;
  try {
    await hubspot.getCompany(hubspotId);
    existsUpstream = true;
  } catch (err) {
    if (!isHubspotNotFound(err)) throw err; // transient/auth → abort, don't guess
  }
  if (existsUpstream) {
    throw new Error(
      `refusing to purge ${hubspotId} (${company.name}) — it STILL EXISTS in HubSpot. Purge is only for companies DELETED upstream; for a merge use --repoint.`
    );
  }

  const docs = await countDocumentsByCompanyId(company.id);
  const deals = await countDealsByCompanyHubspotId(company.hubspotCompanyId);
  // eslint-disable-next-line no-console
  console.log(
    `[reconcile] purge target: ${company.name} [hs ${company.hubspotCompanyId} · uuid ${company.id}] — will PERMANENTLY delete ${docs} document(s), ${deals} deal(s), the company, and any calculator-configs/events (cascade).`
  );

  if (!confirmed) {
    // eslint-disable-next-line no-console
    console.log(
      "[reconcile] DRY-RUN — re-run with --yes to actually delete. THIS IS IRREVERSIBLE."
    );
    return;
  }

  await db.transaction(async tx => {
    // documents first (RESTRICT on company); their events cascade.
    const removedDocs = await hardDeleteDocumentsByCompanyId(company.id, tx);
    // deals next (RESTRICT on company).
    await deleteDealsByCompanyId(company.hubspotCompanyId, tx);
    // finally the company — calculator_configs + their events cascade.
    await deleteCompanyByHubspotId(company.hubspotCompanyId, tx);
    logger.info(
      { hubspotId, documents: removedDocs, deals },
      "[reconcile] purged deleted-upstream company"
    );
    // eslint-disable-next-line no-console
    console.log(
      `[reconcile] purged ${company.name}: ${removedDocs} document(s) + ${deals} deal(s) + company removed.`
    );
  });
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
    const action = d.mergedInto
      ? `MERGED-AWAY ALIAS of survivor ${d.mergedInto} — run: --fix-merged --yes (auto-folds, no survivor lookup needed)`
      : d.documents > 0
        ? `DELETED upstream, owns ${d.documents} document(s); run: --repoint ${d.company.hubspotCompanyId} <survivorHubspotId>  (or --mark / --purge)`
        : prune
          ? "PRUNING (no documents)"
          : "prune-safe (no documents); run: --prune-empty";
    // eslint-disable-next-line no-console
    console.log(
      `  • ${d.company.name}  [hs ${d.company.hubspotCompanyId} · uuid ${d.company.id}]  docs=${d.documents} deals=${d.deals}\n      → ${action}`
    );
  }

  const mergedCount = drifted.filter(d => d.mergedInto).length;
  if (!prune) {
    // eslint-disable-next-line no-console
    console.log(
      `\n[reconcile] dry-run only.${mergedCount > 0 ? ` ${mergedCount} merged-away alias(es) — run --fix-merged --yes to auto-fold them.` : ""} Re-run with --prune-empty to delete no-document drift, or --repoint <from> <to> for deleted companies that own documents.`
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

/**
 * RETROACTIVELY mark drifted companies (gone from HubSpot) that own
 * documents as deleted-from-HubSpot — the same thing the company.deletion
 * webhook now does (drop the deals, stamp hubspot_deleted_at, keep the row
 * + its documents). For PRE-FIX drift whose deletion event already
 * `failed` before the marker existed. Afterwards those companies show the
 * "Deleted in HubSpot" badge + the admin "Delete from system" button.
 * No-document drift is skipped (it should be removed via --prune-empty,
 * not marked).
 */
async function markDrifted(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log("[reconcile] scanning for drifted companies to MARK deleted-from-HubSpot…");
  let drifted: DriftedCompany[];
  try {
    drifted = await findDriftedCompanies();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `[reconcile] scan aborted on a non-404 HubSpot error: ${msg}. No changes were made — fix the upstream issue and re-run.`
    );
  }
  if (drifted.length === 0) {
    // eslint-disable-next-line no-console
    console.log("[reconcile] no drift — every local company still exists in HubSpot.");
    return;
  }

  let marked = 0;
  let skipped = 0;
  for (const d of drifted) {
    if (d.documents === 0) {
      skipped += 1;
      // eslint-disable-next-line no-console
      console.log(
        `  • ${d.company.name} [${d.company.hubspotCompanyId}] — no documents → use --prune-empty (marking is only for document-owning companies)`
      );
      continue;
    }
    await db.transaction(async tx => {
      await deleteDealsByCompanyId(d.company.hubspotCompanyId, tx);
      await markCompanyHubspotDeleted(d.company.hubspotCompanyId, tx);
    });
    marked += 1;
    // eslint-disable-next-line no-console
    console.log(
      `  ✓ marked ${d.company.name} [${d.company.hubspotCompanyId}] deleted-from-HubSpot (${d.documents} document(s) kept) — now shows the badge + admin "Delete from system" button`
    );
  }
  // eslint-disable-next-line no-console
  console.log(
    `\n[reconcile] mark complete: ${marked} marked, ${skipped} skipped (no documents → --prune-empty).`
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

    const purgeIdx = args.indexOf("--purge");
    if (purgeIdx !== -1) {
      const id = args[purgeIdx + 1];
      if (!id) {
        throw new Error("--purge requires a company HubSpot id: --purge <hubspotId> [--yes]");
      }
      await purge(id, args.includes("--yes"));
      return;
    }

    if (args.includes("--mark")) {
      await markDrifted();
      return;
    }

    if (args.includes("--fix-merged")) {
      await fixMerged(args.includes("--yes"));
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
export const __internals = { findDriftedCompanies, scan, repoint, purge, markDrifted, fixMerged };

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
