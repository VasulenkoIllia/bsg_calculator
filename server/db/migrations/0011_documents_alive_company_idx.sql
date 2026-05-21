-- Sprint 9.M S1 (2026-05-21) — composite partial index for the
-- alive-docs-by-company listing hot path.
--
-- Background:
--   Stage 5's `documents_alive_created_idx` is partial on
--   `(created_at DESC) WHERE deleted_at IS NULL`. The most common
--   list query (`WHERE company_id = $1 AND deleted_at IS NULL
--   ORDER BY created_at DESC`) carries `company_id` in the
--   predicate, so the planner can't use the single-column partial
--   index without satisfying the company filter — falls back to
--   the older `documents_company_created_idx` which has NO partial
--   predicate, meaning soft-deleted rows bloat the scan as
--   deleted-doc count grows over time.
--
--   This index covers BOTH the company filter AND the alive
--   predicate in one scan: O(log n) lookup followed by index-order
--   walk. The old `documents_company_created_idx` stays as a
--   fallback for super_admin queries that include deleted rows.
--
-- All steps idempotent.
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "documents_company_alive_created_idx"
  ON "documents" USING btree ("company_id", "created_at" DESC)
  WHERE "deleted_at" IS NULL;
