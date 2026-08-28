/**
 * `companies` table — HubSpot-synced.
 *
 * 8 named columns + `hubspot_raw` JSONB. Decisions:
 * - `hubspot_company_id` is the NATURAL key — FK targets in `deals`,
 *   `documents`, `calculator_configs` reference THIS column (not
 *   `id`). See decisions.md → "Phase 8 architectural conventions"
 *   and "Phase 8 DB audit cleanup".
 * - `hubspot_raw` JSONB stores the full HubSpot payload (~260
 *   properties) so we never lose data even if we don't extract a
 *   column for every field.
 *
 * Indexes (added separately in the migration because Drizzle
 * doesn't yet emit GIN with pg_trgm operators):
 * - btree on hubspot_company_id (UNIQUE, FK target)
 * - btree on name (text_pattern_ops) — kept for compatibility
 * - GIN on name with gin_trgm_ops — for substring autocomplete
 * - btree on (company_type, name) — Agent/Merchant filter + sort
 * - btree on hubspot_modified_at — incremental sync queries
 */

import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const companies = pgTable(
  "companies",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    // Natural key. Stable across HubSpot renames. UNIQUE is the FK target.
    hubspotCompanyId: text("hubspot_company_id").notNull().unique(),
    // Display name. BSG convention: prefix `(A) <agent>` / `(M) <merchant>`.
    name: text("name").notNull(),
    // Enum: 'referring_partner' | 'direct_client'. NULL on records
    // sales has not yet categorised. See hubspot-enums output.
    companyType: text("company_type"),
    // Enum: 'Master_referring_partner' | 'Sub_referring_partner' |
    // 'Direct_Mercahnt' (sic — typo in HubSpot) | 'Aggregating_Merchant'.
    // Confirmed NULL on the merchant we inspected — column allows NULL.
    segmentType: text("segment_type"),
    // HubSpot lifecyclestage (lead, opportunity, customer, etc.).
    lifecycleStage: text("lifecycle_stage"),
    // HubSpot hs_task_label. Usually duplicates name but kept for
    // records where it's filled separately.
    hsTaskLabel: text("hs_task_label"),
    // HubSpot createdate.
    hubspotCreatedAt: timestamp("hubspot_created_at", { withTimezone: true }).notNull(),
    // HubSpot hs_lastmodifieddate. Drives incremental sync.
    hubspotModifiedAt: timestamp("hubspot_modified_at", { withTimezone: true }).notNull(),
    // Full HubSpot payload — all 260+ properties at last sync.
    hubspotRaw: jsonb("hubspot_raw").notNull(),
    // When we last refetched this row from HubSpot.
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Set when HubSpot deleted (or merged away) this company but we
    // CANNOT remove the row because it still owns documents (the
    // documents→companies FK is ON DELETE RESTRICT, protecting legal
    // records). NULL = live in HubSpot. Non-NULL = confirmed gone
    // upstream; the row + its documents are retained, the admin shows a
    // "Deleted in HubSpot" badge, and Note-sync is skipped. Auto-cleared
    // by any successful re-sync (upsert) — i.e. if the company is
    // restored upstream.
    hubspotDeletedAt: timestamp("hubspot_deleted_at", { withTimezone: true }),
    // ─── monday binding chain (added 2026-08-27, migration 0021) ───
    // Runs ALONGSIDE hubspot_company_id, which stays the natural key and
    // FK target. Nothing here replaces anything until CRM_PROVIDER flips.
    crmItemId: text("crm_item_id"),
    crmBoardId: text("crm_board_id"),
    // 'primary' = the row the UI surfaces for this monday item;
    // 'alias'   = one of our duplicates pointing at the same item (eight
    // such pairs exist — HubSpot duplicates the operator merged in monday).
    crmBindingRole: text("crm_binding_role").$type<"primary" | "alias" | null>(),
    mondayRaw: jsonb("monday_raw"),
    crmCreatedAt: timestamp("crm_created_at", { withTimezone: true }),
    crmUpdatedAt: timestamp("crm_updated_at", { withTimezone: true }),
    // Written ONLY by an explicit item_deleted / item_archived event.
    crmDeletedAt: timestamp("crm_deleted_at", { withTimezone: true }),
    crmDeletedReason: text("crm_deleted_reason").$type<"deleted" | "archived" | null>(),
    // Written by the BACKFILL on absence. An observation, never an
    // authorisation — it must never unlock a purge, because absence can
    // also mean a paging glitch or a backfill that ran before the remap.
    crmMissingSince: timestamp("crm_missing_since", { withTimezone: true }),
    // The pre-migration name, kept because the first monday sync renames
    // 71 of 76 companies (monday has no "(M) " / "(A) " prefixes).
    legacyHubspotName: text("legacy_hubspot_name"),
    // First time we saw this company in our DB.
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // Application-managed on every UPDATE.
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  table => ({
    // (Agent/Merchant filter + alphabetical sort) — listing query
    // path: WHERE company_type = $1 ORDER BY name.
    companyTypeNameIdx: index("companies_company_type_name_idx").on(table.companyType, table.name),
    // Drives incremental "what changed since timestamp X?" queries.
    hubspotModifiedAtIdx: index("companies_hubspot_modified_at_idx").on(table.hubspotModifiedAt)
    // GIN on (name) with gin_trgm_ops is added in the migration SQL
    // — Drizzle Kit's pg-core can't emit it via index() yet.
  })
);

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
