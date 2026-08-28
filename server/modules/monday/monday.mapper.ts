/**
 * monday item -> our row shape.
 *
 * TWO PATCHES, NOT ONE. This is the load-bearing idea here.
 *
 *   `binding` — columns that belong exclusively to monday: crm_item_id,
 *               crm_board_id, monday_raw, crm timestamps. Nothing else
 *               writes them, so they are ALWAYS safe to apply, even while
 *               HubSpot is still the active CRM (decision D12: dual reads,
 *               single-provider writes).
 *
 *   `display` — shared columns that HubSpot also maintains: name,
 *               company_type, lifecycle_stage, segment_type, deal stage.
 *               Applied ONLY when monday is the active CRM. Otherwise the
 *               two syncs would overwrite each other on every pass and the
 *               operator would watch fields flip back and forth.
 *
 * A column the resolver could not find is OMITTED from the patch, never
 * set to null. Writing null would silently destroy real data the moment
 * someone renames a column in the monday UI.
 */

import { logger } from "../../middleware/logger";
import type { ResolvedColumns } from "./monday.columns";
import type { MondayColumnValue, MondayItem } from "./monday.types";

export interface CompanyBindingPatch {
  crmItemId: string;
  crmBoardId: string;
  mondayRaw: unknown;
  crmCreatedAt: Date | null;
  crmUpdatedAt: Date | null;
}

export interface CompanyDisplayPatch {
  name?: string;
  companyType?: string;
  lifecycleStage?: string | null;
  segmentType?: string | null;
}

export interface DealBindingPatch {
  crmItemId: string;
  crmBoardId: string;
  crmCompanyItemId: string | null;
  mondayRaw: unknown;
  crmCreatedAt: Date | null;
  crmUpdatedAt: Date | null;
}

export interface DealDisplayPatch {
  name?: string;
  stage?: string | null;
}

function valueOf(item: MondayItem, columns: ResolvedColumns, key: string): MondayColumnValue | null {
  const id = columns.byKey.get(key);
  if (!id) return null; // unresolved optional column -> caller omits the field
  return item.column_values.find(cv => cv.id === id) ?? null;
}

/**
 * Status columns expose `label` (human text) and `index` (stable numeric
 * id). We persist the LABEL because that is what the whole application
 * already speaks, but note that `index` is null on 20 of 103 items even
 * where a label is set — so it can never be used as a presence test.
 */
function statusLabel(cv: MondayColumnValue | null): string | null {
  if (!cv) return null;
  return cv.label ?? cv.text ?? null;
}

/** Dropdowns can hold several values; we join them the way monday displays them. */
function dropdownLabel(cv: MondayColumnValue | null): string | null {
  if (!cv) return null;
  if (cv.values?.length) return cv.values.map(v => v.label).join(", ");
  return cv.text ?? null;
}

/**
 * Board relations expose ids ONLY in `linked_item_ids` — `text` and
 * `value` are both null for this column type. Reading the generic fields
 * is how an early pass concluded the boards had no relations at all.
 */
function firstLinkedId(cv: MondayColumnValue | null): string | null {
  if (!cv) return null;
  const ids = cv.linked_item_ids ?? [];
  if (ids.length > 1) {
    logger.warn(
      { columnId: cv.id, linked: ids },
      "[monday:mapper] relation holds several linked items — using the first; monday has no notion of a primary link"
    );
  }
  return ids[0] ?? null;
}

function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

// ─── Companies + Agents ──────────────────────────────────────────────

export function mapCompanyBinding(item: MondayItem, boardId: string): CompanyBindingPatch {
  return {
    crmItemId: item.id,
    crmBoardId: boardId,
    // The full column payload, so a future field promotion never needs a
    // re-fetch — same reasoning as hubspot_raw, which stays untouched
    // beside it as the sole surviving copy of the KYB dossier.
    mondayRaw: { name: item.name, state: item.state, group: item.group, column_values: item.column_values },
    crmCreatedAt: parseDate(item.created_at),
    crmUpdatedAt: parseDate(item.updated_at)
  };
}

/**
 * `companyType` comes from the BOARD, not from a column: merchants and
 * agents live on separate boards, which is what replaces the old
 * `HUBSPOT_COMPANY_TYPE_FILTER`. It also means the value cannot go stale
 * when someone edits a dropdown.
 */
export function mapCompanyDisplay(
  item: MondayItem,
  columns: ResolvedColumns,
  kind: "merchant" | "agent"
): CompanyDisplayPatch {
  const patch: CompanyDisplayPatch = {
    name: item.name,
    companyType: kind === "merchant" ? "direct_client" : "referring_partner"
  };

  const status = valueOf(item, columns, kind === "merchant" ? "status" : "lifecycleStage");
  if (status) {
    patch.lifecycleStage =
      kind === "merchant" ? statusLabel(status) : dropdownLabel(status);
  }

  const segment = valueOf(item, columns, "segmentType");
  if (segment) patch.segmentType = dropdownLabel(segment);

  return patch;
}

/** The HubSpot company id an agent card carries in its "Id" text column. */
export function agentLegacyHubspotId(item: MondayItem, columns: ResolvedColumns): string | null {
  const cv = valueOf(item, columns, "legacyHubspotId");
  const raw = cv?.text?.trim() ?? "";
  return /^\d{6,}$/.test(raw) ? raw : null;
}

/** Our own company UUID, if it has already been written back to monday. */
export function bsgIdOf(item: MondayItem, columns: ResolvedColumns): string | null {
  const raw = valueOf(item, columns, "bsgId")?.text?.trim() ?? "";
  return raw.length > 0 ? raw : null;
}

// ─── Deals ───────────────────────────────────────────────────────────

export function mapDealBinding(
  item: MondayItem,
  boardId: string,
  columns: ResolvedColumns
): DealBindingPatch {
  return {
    crmItemId: item.id,
    crmBoardId: boardId,
    crmCompanyItemId: firstLinkedId(valueOf(item, columns, "company")),
    mondayRaw: { name: item.name, state: item.state, group: item.group, column_values: item.column_values },
    crmCreatedAt: parseDate(item.created_at),
    crmUpdatedAt: parseDate(item.updated_at)
  };
}

/**
 * Deal stage: prefer the Status column, fall back to the GROUP title.
 * The groups mirror the funnel exactly (New referral / Qualified /
 * Pre-Approved by Bank / Onboarded / Closed Lost) and groups survive a
 * column being deleted — which is precisely what happened to the previous
 * `Deal Stage` dropdown between 22 and 27 August.
 */
export function mapDealDisplay(item: MondayItem, columns: ResolvedColumns): DealDisplayPatch {
  const patch: DealDisplayPatch = { name: item.name };
  const status = statusLabel(valueOf(item, columns, "status"));
  patch.stage = status ?? item.group?.title ?? null;
  return patch;
}

/** The `(662129)`-style reference used to match monday deals to ours. */
export function dealOrderRef(item: MondayItem, columns: ResolvedColumns): string | null {
  const explicit = valueOf(item, columns, "orderRef")?.text?.trim();
  if (explicit) return explicit;
  const fromName = item.name.match(/\((\d{5,8})\)/);
  return fromName ? fromName[1] : null;
}
