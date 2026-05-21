/**
 * Calculator-configs DB access.
 *
 * Read side: list + by-id. Sprint 6.8 added per-column sort over
 * (title, companyName, hubspotDealId, updatedAt, createdAt) ×
 * (asc, desc). Default remains createdAt-desc to preserve pre-6.8
 * pagination behaviour. The cursor predicate uses `(sortExpr, id)`
 * tuple comparison to stay stable across duplicate sort values.
 * String columns use LOWER() for case-insensitive A-Z ordering;
 * the matching functional indexes shipped in migration 0006.
 *
 * Sprint 6.9 N5 — locale note: LOWER() respects Postgres
 * `LC_COLLATE` (default `en_US.UTF-8`). Cyrillic / European company
 * names will cluster at the end of an ASC list rather than
 * interspersed alphabetically with Latin ones. If correct
 * locale-aware ordering becomes a product requirement, switch to
 * `COLLATE "und-x-icu"` on the affected columns.
 *
 * Write side: insert + update. UPDATE sets `updatedAt = now()` so
 * listings can render "last edited X ago" without a separate
 * touch-trigger.
 *
 * The "company AND (deal IS NULL OR deal = $dealId)" picker query
 * uses the composite index defined in the schema file.
 */

import { and, asc, desc, eq, gt, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/client";
import {
  calculatorConfigs,
  companies,
  type CalculatorConfig,
  type NewCalculatorConfig
} from "../../db/schema";
import {
  assertCursorValueIsIsoDate,
  type SortSpec,
  type SortedCursor
} from "../../shared/sorted-pagination";

/**
 * Sprint 6.8: whitelist of sortable columns. Encoded as a const
 * tuple so `parseSortQuery` can both validate input and drive
 * the type system.
 */
export const calculatorConfigSortFields = [
  "title",
  "companyName",
  "hubspotDealId",
  "updatedAt",
  "createdAt"
] as const;
export type CalculatorConfigSortField = (typeof calculatorConfigSortFields)[number];

/**
 * Sprint 6.7 audit fix (S4): list-endpoint row shape that carries
 * the company name alongside the config row. Cross-company listing
 * surfaces this so the operator can tell rows apart at a glance.
 * Single-config fetch (`findById`) does NOT JOIN — that endpoint
 * feeds /calc/:id which only renders the config title.
 */
export interface CalculatorConfigWithCompanyName extends CalculatorConfig {
  companyName: string;
}

export async function findById(id: string): Promise<CalculatorConfig | undefined> {
  const rows = await db
    .select()
    .from(calculatorConfigs)
    .where(eq(calculatorConfigs.id, id))
    .limit(1);
  return rows[0];
}

export async function insertCalculatorConfig(
  row: NewCalculatorConfig
): Promise<CalculatorConfig> {
  const inserted = await db.insert(calculatorConfigs).values(row).returning();
  if (inserted.length !== 1) {
    throw new Error("expected exactly one row from INSERT");
  }
  return inserted[0];
}

/**
 * Sprint 6.7 audit fix (C3): both optional fields are REQUIRED on
 * this patch shape. The service layer always resolves them to either
 * the new value (when present in the request body) or the existing
 * column value (when absent) BEFORE calling here. Forcing the fields
 * to be passed at the repo boundary removes a foot-gun for any
 * future caller that bypasses the service — previously the
 * `?? null` collapse silently nulled the column when the field was
 * omitted, which is exactly the bug we fixed in the service.
 */
export interface UpdateCalculatorConfigPatch {
  hubspotDealId: string | null;
  title: string | null;
  payload: unknown;
}

export async function updateCalculatorConfig(
  id: string,
  patch: UpdateCalculatorConfigPatch
): Promise<CalculatorConfig | undefined> {
  const rows = await db
    .update(calculatorConfigs)
    .set({
      hubspotDealId: patch.hubspotDealId,
      title: patch.title,
      payload: patch.payload,
      updatedAt: new Date()
    })
    .where(eq(calculatorConfigs.id, id))
    .returning();
  return rows[0];
}

export async function deleteCalculatorConfig(id: string): Promise<boolean> {
  const rows = await db
    .delete(calculatorConfigs)
    .where(eq(calculatorConfigs.id, id))
    .returning({ id: calculatorConfigs.id });
  return rows.length > 0;
}

/**
 * Phase 9.I — patch a calc-config's HubSpot sync state + note id
 * after a write-back attempt. Mirrors documents.repository
 * `updateDocumentHubspotSync`.
 *
 * Used by the sync.service to persist the outcome of the
 * createNote + association API calls AFTER the underlying TX.
 *
 * Returns the updated row (undefined if no row matched — caller
 * surfaces NotFoundError).
 */
export async function updateCalculatorConfigHubspotSync(
  id: string,
  patch: {
    hubspotSyncState: "not_synced" | "synced" | "failed";
    hubspotNoteId: string | null;
  }
): Promise<CalculatorConfig | undefined> {
  const rows = await db
    .update(calculatorConfigs)
    .set({
      hubspotSyncState: patch.hubspotSyncState,
      hubspotNoteId: patch.hubspotNoteId,
      updatedAt: new Date()
    })
    .where(eq(calculatorConfigs.id, id))
    .returning();
  return rows[0];
}

export interface ListCalculatorConfigsArgs {
  /**
   * Sprint 6.6: optional. When absent → returns every config across
   * every company (used by the top-level /calculators discovery
   * page). When present → behaves exactly as Sprint 3/6.4.
   */
  companyId?: string;
  hubspotDealId?: string;
  showAll: boolean;
  /** Sprint 6.6: optional substring search on `title`. */
  q?: string;
  /** Sprint 6.8: clickable-header per-column sort. */
  sort: SortSpec<CalculatorConfigSortField>;
  cursor: SortedCursor | null;
  limit: number;
}

/**
 * Sprint 6.8: derive the cursor value from a row given the sort field.
 * Mirrors the LOWER() collation used in ORDER BY for string columns so
 * the predicate composes correctly. Exposed for the service's
 * `buildSortedPage` toCursor callback.
 *
 * Note: `hubspotDealId` is nullable; when NULL we coerce to "" so
 * stable comparisons still work. Postgres NULLs sort last by default
 * — the empty-string fallback matches that for the cursor predicate.
 */
export function cursorValueForRow(
  row: CalculatorConfigWithCompanyName,
  field: CalculatorConfigSortField
): string {
  switch (field) {
    case "title":
      return (row.title ?? "").toLowerCase();
    case "companyName":
      return row.companyName.toLowerCase();
    case "hubspotDealId":
      return (row.hubspotDealId ?? "").toLowerCase();
    case "updatedAt":
      return row.updatedAt.toISOString();
    case "createdAt":
      return row.createdAt.toISOString();
    default: {
      // Sprint 6.9 S1: assertNever exhaustiveness so adding a new
      // entry to CalculatorConfigSortField without updating this
      // switch becomes a COMPILE error instead of a silent
      // undefined-returning function that corrupts the cursor.
      const _exhaustive: never = field;
      throw new Error(`cursorValueForRow: unhandled sort field ${String(_exhaustive)}`);
    }
  }
}

/**
 * Escape `%` and `_` so a user-supplied `?q=` is treated as literal
 * text by LIKE. Mirrors the helper in documents.repository.ts.
 */
function escapeLikePattern(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/[%_]/g, "\\$&");
}

/**
 * List configs.
 *
 * Filter logic:
 *   - companyId absent (Sprint 6.6): no company filter → cross-company
 *     listing for the operator's "Saved Calculators" workspace tab.
 *     Deal/showAll knobs are ignored in this mode because they only
 *     make sense relative to a chosen company.
 *   - showAll = true: WHERE company_id = $1
 *   - showAll = false AND hubspotDealId provided:
 *       WHERE company_id = $1
 *         AND (hubspot_deal_id IS NULL OR hubspot_deal_id = $2)
 *   - showAll = false AND hubspotDealId omitted:
 *       WHERE company_id = $1 AND hubspot_deal_id IS NULL
 *       (= "company-level drafts only" — useful for the standalone
 *        wizard entry where no deal is selected yet)
 *   - q present: AND title ILIKE '%<escaped>%' (added to every mode).
 */
export async function listCalculatorConfigs(
  args: ListCalculatorConfigsArgs
): Promise<CalculatorConfigWithCompanyName[]> {
  // Build filters as an array so we can omit undefined entries cleanly.
  // Sprint 6.7 audit fix (N1): typed as SQL<unknown> not
  // ReturnType<typeof eq> — the array also holds or(), and(), ilike(),
  // isNull() returns which share the SQL<unknown> shape but aren't
  // assignable to the narrower `eq` return type.
  const filters: Array<SQL<unknown> | undefined> = [];

  if (args.companyId) {
    filters.push(eq(calculatorConfigs.companyId, args.companyId));

    // Deal / showAll knobs are ONLY meaningful with a chosen company.
    // Cross-company mode skips them entirely.
    const dealFilter = args.showAll
      ? undefined
      : args.hubspotDealId
        ? or(
            isNull(calculatorConfigs.hubspotDealId),
            eq(calculatorConfigs.hubspotDealId, args.hubspotDealId)
          )
        : isNull(calculatorConfigs.hubspotDealId);
    if (dealFilter) filters.push(dealFilter);
  }

  if (args.q) {
    // Sprint 6.7 audit fix (S10): use a raw SQL fragment with an
    // explicit `ESCAPE '\'` clause so the LIKE escape behaviour is
    // independent of the connection's `standard_conforming_strings`
    // setting. Drizzle's `ilike()` helper would emit a plain
    // `column ILIKE pattern` without an ESCAPE clause, relying on
    // PostgreSQL's implicit default. The pattern itself is still
    // parameterised — only the column reference + ESCAPE literal
    // are inlined.
    const pattern = `%${escapeLikePattern(args.q)}%`;
    filters.push(
      sql`${calculatorConfigs.title} ILIKE ${pattern} ESCAPE '\\'`
    );
  }

  // Sprint 6.8: per-column sort. ORDER BY (chosen, id) keeps
  // pagination stable; the cursor predicate mirrors the ORDER BY.
  // String columns use LOWER() so a-z + A-Z interleave correctly
  // (case-insensitive A-Z UX). hubspotDealId is COALESCE'd to "" so
  // NULL doesn't break the comparison — matches `cursorValueForRow`.
  const sortExprByField: Record<CalculatorConfigSortField, ReturnType<typeof sql>> = {
    title: sql`LOWER(COALESCE(${calculatorConfigs.title}, ''))`,
    companyName: sql`LOWER(${companies.name})`,
    hubspotDealId: sql`LOWER(COALESCE(${calculatorConfigs.hubspotDealId}, ''))`,
    updatedAt: sql`${calculatorConfigs.updatedAt}`,
    createdAt: sql`${calculatorConfigs.createdAt}`
  };
  const sortExpr = sortExprByField[args.sort.field];
  const dirCol = args.sort.dir === "asc" ? asc : desc;
  const dirCmp = args.sort.dir === "asc" ? gt : lt;

  if (args.cursor) {
    // Sprint 6.9 C1: validate ISO before `new Date(...)` for date
    // sorts. Mirrors documents.repository — see note there.
    const isDateSort =
      args.sort.field === "createdAt" || args.sort.field === "updatedAt";
    let cursorValueExpr;
    if (isDateSort) {
      assertCursorValueIsIsoDate(args.cursor.value);
      cursorValueExpr = sql`${new Date(args.cursor.value)}::timestamptz`;
    } else {
      cursorValueExpr = sql`${args.cursor.value}`;
    }

    filters.push(
      or(
        dirCmp(sortExpr, cursorValueExpr),
        and(eq(sortExpr, cursorValueExpr), dirCmp(calculatorConfigs.id, args.cursor.id))
      )
    );
  }

  const definedFilters = filters.filter(
    (f): f is Exclude<typeof f, undefined> => f !== undefined
  );

  // Sprint 6.7 audit fix (S4): JOIN companies so each row carries
  // `companyName`. Cheap (FK indexed) and saves the frontend from
  // N+1 lookups when rendering the cross-company list.
  const rows = await db
    .select({
      config: calculatorConfigs,
      companyName: companies.name
    })
    .from(calculatorConfigs)
    .innerJoin(companies, eq(calculatorConfigs.companyId, companies.id))
    .where(definedFilters.length > 0 ? and(...definedFilters) : undefined)
    .orderBy(dirCol(sortExpr), dirCol(calculatorConfigs.id))
    .limit(args.limit);

  return rows.map(r => ({ ...r.config, companyName: r.companyName }));
}

/**
 * Cross-company-deal validation helper. Returns true if the given
 * deal belongs to the given company. Used to reject configs that
 * would attach a deal to the wrong company.
 *
 * Reads `deals.hubspot_company_id` (natural FK) and resolves to
 * `companies.id` (UUID). One round-trip query.
 */
export async function dealBelongsToCompany(
  hubspotDealId: string,
  companyId: string
): Promise<boolean> {
  const rows = await db.execute<{ matches: number }>(sql`
    SELECT 1 AS matches
    FROM deals d
    JOIN companies c ON c.hubspot_company_id = d.hubspot_company_id
    WHERE d.hubspot_deal_id = ${hubspotDealId}
      AND c.id = ${companyId}
    LIMIT 1
  `);
  return rows.rows.length > 0;
}
