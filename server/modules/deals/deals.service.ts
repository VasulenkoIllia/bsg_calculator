/**
 * Deals service.
 */

import { env } from "../../config/env";
import { NotFoundError } from "../../shared/errors";
import { encodeCursor } from "../../shared/pagination";
import { logger } from "../../middleware/logger";
import { hubspot } from "../hubspot/hubspot.client";
import { mapHubspotDealToRow } from "../hubspot/hubspot.mapper";
import type { Deal } from "../../db/schema";
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

export interface DealListPage {
  items: DealPublic[];
  nextCursor: string | null;
  limit: number;
}

export async function searchDeals(args: ListDealsArgs): Promise<DealListPage> {
  const rows = await listDeals({ ...args, limit: args.limit + 1 });
  const hasMore = rows.length > args.limit;
  const items = hasMore ? rows.slice(0, args.limit) : rows;

  let nextCursor: string | null = null;
  if (hasMore) {
    const last = items[items.length - 1];
    nextCursor = encodeCursor({
      createdAt: last.createdAt.toISOString(),
      id: last.id
    });
  }

  return {
    items: items.map(toPublic),
    nextCursor,
    limit: args.limit
  };
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
      if (mapped) {
        await upsertDeal(mapped);
        logger.info(
          { hubspotDealId: row.hubspotDealId, ageMs },
          "[deals] TTL refresh: row refreshed"
        );
      }
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
