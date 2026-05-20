/**
 * `deals` table — HubSpot-synced.
 *
 * 12 named columns + `hubspot_raw` JSONB + FK to `companies` via the
 * natural key (`hubspot_company_id`). See decisions.md → "Phase 8
 * architectural conventions" for the rationale of natural-key FKs.
 *
 * NOTE: Pricing fields (forecasted_monthly_volume, transaction_fee__mdr,
 * etc.) are NOT extracted — they live in `hubspot_raw`. The link-only
 * integration model fills the calculator manually; HubSpot deal
 * pricing is informational at best (and ~100% NULL in BSG's data).
 */

import { sql } from "drizzle-orm";
import { index, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies";

export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    // Natural key. UNIQUE — FK target for documents/calc_configs.
    hubspotDealId: text("hubspot_deal_id").notNull().unique(),
    // FK → companies.hubspot_company_id. RESTRICT on delete: can't
    // orphan a deal. CASCADE on update: HubSpot re-key propagates.
    hubspotCompanyId: text("hubspot_company_id")
      .notNull()
      .references(() => companies.hubspotCompanyId, {
        onDelete: "restrict",
        onUpdate: "cascade"
      }),
    // HubSpot dealname.
    name: text("name").notNull(),
    // HubSpot dealstage. ID (e.g. 'appointmentscheduled', '5230659805').
    // Resolve to human label via the cached pipeline list (Sprint 2.5).
    stage: text("stage"),
    // HubSpot pipeline id. Currently always 'default' (Gateway sales
    // pipeline). Stored for forward compatibility if BSG adds another.
    pipelineId: text("pipeline_id"),
    // HubSpot amount.
    amount: numeric("amount", { precision: 14, scale: 2 }),
    // HubSpot deal_currency_code (ISO, e.g. 'EUR').
    currency: text("currency"),
    // HubSpot 'client' free-text (e.g. '(M) Atom').
    clientLabel: text("client_label"),
    // HubSpot 'agent' free-text (e.g. '(A) Jeremy').
    agentLabel: text("agent_label"),
    // HubSpot business_vertical enum (e.g. 'iGaming / Betting').
    businessVertical: text("business_vertical"),
    // HubSpot createdate.
    hubspotCreatedAt: timestamp("hubspot_created_at", { withTimezone: true }).notNull(),
    // HubSpot hs_lastmodifieddate. Incremental sync trigger.
    hubspotModifiedAt: timestamp("hubspot_modified_at", { withTimezone: true }).notNull(),
    // Full HubSpot payload — all 237+ properties at last sync,
    // including all pricing / KYB / business context fields that we
    // deliberately do NOT extract.
    hubspotRaw: jsonb("hubspot_raw").notNull(),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  table => ({
    // Drives "deals for this company" listing. INCLUDE clause for
    // covering scan added in the migration SQL.
    companyCreatedAtIdx: index("deals_company_created_at_idx").on(
      table.hubspotCompanyId,
      table.hubspotCreatedAt
    ),
    // Stage filter ("show me all Proposal Sent deals").
    stageIdx: index("deals_stage_idx").on(table.stage),
    // Incremental sync.
    hubspotModifiedAtIdx: index("deals_hubspot_modified_at_idx").on(table.hubspotModifiedAt)
  })
);

export type Deal = typeof deals.$inferSelect;
export type NewDeal = typeof deals.$inferInsert;
