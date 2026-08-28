/**
 * Refresh ONE row from monday — the monday half of TTL-refresh-on-read.
 *
 * The HubSpot era had this and the monday era did not, which was a real
 * stability gap rather than a cosmetic one. Under HubSpot, a row nobody
 * had synced in a while healed itself the moment an operator looked at
 * it. After the cutover that path was switched off (correctly — it would
 * have fired at a dead API) and nothing replaced it, so freshness rested
 * entirely on webhooks. A webhook deleted in monday, or an event that
 * burned its five retries, meant a row stayed wrong indefinitely with
 * nothing to notice.
 *
 * This restores the same behaviour against monday: reading a stale row
 * schedules a background re-read of that one item.
 *
 * ABSENCE IS NOT ACTED ON. If monday does not return the item, this logs
 * and leaves the row exactly as it is — it does not flag, and it
 * certainly does not delete. A single-item fetch cannot tell "deleted"
 * from "transient failure" or "permissions changed"; only the backfill
 * can, because it reads the whole board and aborts if a suspicious share
 * of rows went missing at once. Keeping that judgement in one place is
 * deliberate.
 */

import { env } from "../../config/env";
import { logger } from "../../middleware/logger";
import { monday } from "./monday.client";
import { columnsFor } from "./monday.column-cache";
import { upsertOneCompany, upsertOneDeal } from "./monday.backfill";

/** Which board an item belongs to, from what we already cached. */
function boardFor(kind: "merchant" | "agent" | "deal"): string {
  if (kind === "deal") return env.MONDAY_BOARD_DEALS;
  return kind === "agent" ? env.MONDAY_BOARD_AGENTS : env.MONDAY_BOARD_COMPANIES;
}

export async function refreshCompanyFromMonday(input: {
  crmItemId: string;
  crmBoardId: string | null;
  companyType: string | null;
}): Promise<void> {
  const kind = input.companyType === "referring_partner" ? "agent" : "merchant";
  const boardId = input.crmBoardId ?? boardFor(kind);

  const items = await monday.getItemsById([input.crmItemId]);
  const item = items.get(input.crmItemId);
  if (!item) {
    logger.warn(
      { crmItemId: input.crmItemId, boardId },
      "[monday] TTL refresh: item not returned — row left untouched (absence is not proof of deletion; the backfill decides that)"
    );
    return;
  }
  if ((item.state ?? "active") !== "active") {
    logger.warn(
      { crmItemId: input.crmItemId, state: item.state },
      "[monday] TTL refresh: item is not active — row left untouched, the delete/archive path owns that decision"
    );
    return;
  }

  const cols = await columnsFor(boardId, kind === "agent" ? "agent" : "company");
  await upsertOneCompany(item, boardId, cols, kind);
}

export async function refreshDealFromMonday(input: {
  crmItemId: string;
  crmBoardId: string | null;
}): Promise<void> {
  const boardId = input.crmBoardId ?? env.MONDAY_BOARD_DEALS;

  const items = await monday.getItemsById([input.crmItemId]);
  const item = items.get(input.crmItemId);
  if (!item) {
    logger.warn(
      { crmItemId: input.crmItemId, boardId },
      "[monday] TTL refresh: deal not returned — row left untouched"
    );
    return;
  }
  if ((item.state ?? "active") !== "active") {
    logger.warn(
      { crmItemId: input.crmItemId, state: item.state },
      "[monday] TTL refresh: deal is not active — row left untouched"
    );
    return;
  }

  const cols = await columnsFor(boardId, "deal");
  await upsertOneDeal(item, boardId, cols);
}
