/**
 * `calculator_configs` table — operator-saved calculator snapshots.
 *
 * Sprint 3 anchor decision (decisions.md → "Pre-Sprint 3 …"):
 *   - `company_id NOT NULL` — every config belongs to a company.
 *     CASCADE on company delete (operational decision: when ops
 *     archives a company, drafts disappear with it).
 *   - `hubspot_deal_id NULL` — optional pin to a specific deal.
 *     SET NULL on deal delete so the config survives.
 *   - NO UNIQUE constraint on (company_id, hubspot_deal_id) —
 *     multiple drafts per deal allowed (operator can keep what-if
 *     versions side-by-side).
 *
 * Storage model: the `payload` JSONB column holds the full
 * CalculatorSnapshotPayload (see src/components/calculator/snapshotShape.ts).
 * Backend validates the shape via Zod on POST/PUT and stores the
 * raw object — UI hydrates back into the calculator via
 * `seedCalculatorStateFromSnapshot()`.
 *
 * Indexes:
 *   - btree on (company_id, hubspot_deal_id, created_at DESC) drives
 *     the wizard Step 1 picker query:
 *       WHERE company_id = $1 AND (deal_id IS NULL OR deal_id = $2)
 *       ORDER BY created_at DESC
 */

import { sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies";
import { deals } from "./deals";
import { users } from "./users";

export const calculatorConfigs = pgTable(
  "calculator_configs",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    // FK to companies.id (UUID PK). CASCADE — calc has no value
    // without its company.
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    // FK to deals.hubspot_deal_id (NATURAL key — see deals.ts for
    // rationale). NULL allowed so operator can save a draft against
    // a company before a deal exists in HubSpot.
    hubspotDealId: text("hubspot_deal_id").references(() => deals.hubspotDealId, {
      onDelete: "set null"
    }),
    // Human-friendly label. NULL = operator left it blank; UI shows
    // an auto-generated placeholder ("Untitled · <company> · <date>")
    // on lists.
    title: text("title"),
    // Full CalculatorSnapshotPayload as JSON. Validated via Zod at
    // controller boundary. Stored raw so future schema additions don't
    // require a migration.
    payload: jsonb("payload").notNull(),
    // Who created the config. RESTRICT — we don't delete users without
    // first reassigning or hard-archiving their work, see users.ts.
    createdByUserId: uuid("created_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Application-managed: bumped on PUT (full payload replace).
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  table => ({
    // Drives the wizard Step 1 picker: configs filtered by company,
    // optionally by deal, ordered newest-first. The DESC on created_at
    // lets the planner walk the index backwards instead of sorting.
    pickerIdx: index("calculator_configs_company_deal_created_idx").on(
      table.companyId,
      table.hubspotDealId,
      table.createdAt
    ),
    // Helper for the "configs created by me" view (future operator
    // dashboard). Cheap to add now; would require a re-index if added
    // later.
    createdByIdx: index("calculator_configs_created_by_idx").on(
      table.createdByUserId,
      table.createdAt
    )
  })
);

export type CalculatorConfig = typeof calculatorConfigs.$inferSelect;
export type NewCalculatorConfig = typeof calculatorConfigs.$inferInsert;
