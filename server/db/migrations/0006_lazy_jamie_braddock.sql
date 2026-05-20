-- Sprint 6.9 C3 / N6: indexes supporting the per-column sort UX
-- shipped in Sprint 6.8.
--
-- Pre-6.8, both /documents and /calculators only ever sorted by
-- (createdAt DESC, id DESC) and the composite indexes covering
-- (company_id, created_at) handled the typical filtered query path.
-- Sprint 6.8 added five new sort columns per endpoint, each of which
-- uses `LOWER(col)` (or `LOWER(COALESCE(col, ''))` for nullable) to
-- get case-insensitive A-Z ordering. Without functional indexes,
-- every page is a full filesort.
--
-- At the current data volume (< few hundred rows) this is fine, but
-- adding these indexes now is cheap insurance — the alternative is
-- silent degradation as the dataset grows, with no migration trip
-- wire to remind us to add them.
--
-- Naming convention: `<table>_<col>_lower_idx`.
-- For nullable columns the index expression includes the COALESCE
-- so it matches the ORDER BY clause exactly (otherwise Postgres
-- won't use it).
--> statement-breakpoint
-- Sprint 6.9 S6: documents.number was LOWER()'d in pre-S6 code,
-- but the ORDER BY now uses raw `number` (the column is already
-- uppercase fixed-format BSG-XXXXXXX-XXXXXX). The existing UNIQUE
-- constraint on documents.number already provides a btree index
-- that serves the sort path. We still create the LOWER variant
-- below as defensive coverage for any future LOWER() reintroduction
-- (e.g. if number ever grows mixed-case suffixes).
CREATE INDEX IF NOT EXISTS "documents_number_lower_idx"
  ON "documents" (LOWER("number"));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_scope_lower_idx"
  ON "documents" (LOWER("scope"));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "documents_hubspot_sync_state_lower_idx"
  ON "documents" (LOWER("hubspot_sync_state"));
--> statement-breakpoint
-- Sprint 6.9 N6: standalone btree on documents.company_id. We
-- already have a composite (company_id, created_at) but a standalone
-- helps the Nested Loop Join when sorting by something other than
-- created_at (e.g. `?sort=companyName:asc`).
CREATE INDEX IF NOT EXISTS "documents_company_id_idx"
  ON "documents" ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calculator_configs_title_lower_idx"
  ON "calculator_configs" (LOWER(COALESCE("title", '')));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "calculator_configs_hubspot_deal_id_lower_idx"
  ON "calculator_configs" (LOWER(COALESCE("hubspot_deal_id", '')));
--> statement-breakpoint
-- companyName sorts use companies.name from the JOINed table; the
-- index lives on companies, not on documents / calculator_configs.
CREATE INDEX IF NOT EXISTS "companies_name_lower_idx"
  ON "companies" (LOWER("name"));
