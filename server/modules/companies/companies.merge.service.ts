/**
 * HubSpot merge reconciliation (Option A — re-point, don't delete).
 *
 * When two records are merged in HubSpot, the merged-away (secondary)
 * record's id starts returning 404 and HubSpot fires a `*.merge`
 * webhook — NOT a `*.deletion`. If we ignore it, the secondary lingers
 * in our cache forever: every TTL refresh / Note-association then 404s
 * or 400s against a dead id (the original "(M) TEST 1 c" drift bug).
 *
 * Company merge (the important case — companies OWN documents):
 *   1. Make sure the surviving PRIMARY company exists in our cache
 *      (fetch + upsert on demand, regardless of the company_type
 *      filter — it now owns the secondary's documents).
 *   2. For each merged-away SECONDARY, in one transaction:
 *        re-point its documents + calculator-configs (UUID FK) and its
 *        deals (natural-key FK) onto the primary, THEN delete the
 *        secondary company row. Order matters — documents + deals are
 *        ON DELETE RESTRICT, so the delete only succeeds once nothing
 *        references the secondary. calculator-configs are ON DELETE
 *        CASCADE, so re-pointing them first is what PRESERVES them.
 *
 * Deal merge (deals own no legal records): the doc/config → deal FK is
 * ON DELETE SET NULL, so we simply remove the merged-away secondary
 * deals; any document that pinned one has its `hubspot_deal_id`
 * nulled. The surviving primary deal is kept in sync by its own
 * creation/propertyChange events.
 *
 * Idempotent: a re-delivered merge event finds the secondary already
 * gone and is a no-op.
 */

import { db } from "../../db/client";
import type { Company } from "../../db/schema";
import { logger } from "../../middleware/logger";
import { NotFoundError } from "../../shared/errors";
import { hubspot } from "../hubspot/hubspot.client";
import { mapHubspotCompanyToRow } from "../hubspot/hubspot.mapper";
import { repointDocumentsToCompany } from "../documents/documents.repository";
import { repointCalculatorConfigsToCompany } from "../calculator-configs/calculator-configs.repository";
import {
  deleteDealByHubspotId,
  repointDealsToCompany
} from "../deals/deals.repository";
import {
  deleteCompanyByHubspotId,
  findCompanyByHubspotId,
  upsertCompany
} from "./companies.repository";

/**
 * Ensure a company is present in our cache, fetching + upserting it
 * from HubSpot on demand. Bypasses the company_type filter on purpose:
 * a merge survivor that inherits documents must be kept even if its
 * type would normally be filtered out. Returns the cached row, or
 * `undefined` if HubSpot 404s it (can't re-point onto a ghost).
 * Re-throws transient HubSpot errors so the worker retries.
 */
async function ensureCompanyCached(hubspotCompanyId: string): Promise<Company | undefined> {
  const existing = await findCompanyByHubspotId(hubspotCompanyId);
  if (existing) return existing;
  try {
    const obj = await hubspot.getCompany(hubspotCompanyId);
    const row = mapHubspotCompanyToRow(obj);
    if (!row) return undefined;
    return await upsertCompany(row);
  } catch (err) {
    if (err instanceof NotFoundError) return undefined;
    throw err;
  }
}

/**
 * Re-point a merged-away company's documents/configs/deals onto the
 * surviving primary, then remove it. See file header.
 */
export async function handleCompanyMerge(
  primaryHubspotId: string,
  mergedHubspotIds: string[]
): Promise<void> {
  const secondaries = mergedHubspotIds.filter(id => id && id !== primaryHubspotId);
  if (secondaries.length === 0) {
    logger.warn(
      { primaryHubspotId },
      "[hubspot:merge] company.merge carried no secondary ids — nothing to re-point"
    );
    return;
  }

  const primary = await ensureCompanyCached(primaryHubspotId);
  if (!primary) {
    logger.error(
      { primaryHubspotId, secondaries },
      "[hubspot:merge] surviving company not found in HubSpot or cache — skipping re-point (secondary left for reconcile)"
    );
    return;
  }

  for (const mergedId of secondaries) {
    const secondary = await findCompanyByHubspotId(mergedId);
    if (!secondary) {
      logger.info(
        { mergedId, primaryHubspotId },
        "[hubspot:merge] secondary company already absent — skip"
      );
      continue;
    }

    await db.transaction(async tx => {
      // ORDER IS LOAD-BEARING: every re-point MUST run BEFORE the
      // deleteCompanyByHubspotId below.
      //   - documents + deals are ON DELETE RESTRICT → the company delete
      //     would FK-fail if they still pointed at the secondary.
      //   - calculator_configs are ON DELETE CASCADE → deleting the
      //     company FIRST would DESTROY the configs before we could move
      //     them. Re-pointing first is what PRESERVES them.
      // Do not reorder these statements.
      const documentsMoved = await repointDocumentsToCompany(secondary.id, primary.id, tx);
      const configsMoved = await repointCalculatorConfigsToCompany(
        secondary.id,
        primary.id,
        tx
      );
      const dealsMoved = await repointDealsToCompany(
        secondary.hubspotCompanyId,
        primary.hubspotCompanyId,
        tx
      );
      await deleteCompanyByHubspotId(secondary.hubspotCompanyId, tx);
      logger.info(
        {
          mergedId,
          primaryHubspotId,
          moved: { documents: documentsMoved, calculatorConfigs: configsMoved, deals: dealsMoved }
        },
        "[hubspot:merge] re-pointed secondary company into surviving primary"
      );
    });
  }
}

/**
 * Remove merged-away secondary deals. The doc/config → deal FK is
 * SET NULL, so documents that pinned a secondary deal simply lose the
 * (now-defunct) pin. The surviving primary deal stays in sync via its
 * own events. Idempotent.
 */
export async function handleDealMerge(
  primaryDealId: string,
  mergedDealIds: string[]
): Promise<void> {
  const secondaries = mergedDealIds.filter(id => id && id !== primaryDealId);
  if (secondaries.length === 0) {
    logger.warn(
      { primaryDealId },
      "[hubspot:merge] deal.merge carried no secondary ids — nothing to remove"
    );
    return;
  }
  for (const mergedId of secondaries) {
    const deleted = await deleteDealByHubspotId(mergedId);
    if (deleted) {
      logger.info(
        { mergedId, primaryDealId },
        "[hubspot:merge] removed merged-away secondary deal"
      );
    }
  }
}
