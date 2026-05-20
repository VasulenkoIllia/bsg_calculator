-- pg_trgm extension powers substring-search on companies.name via
-- a GIN index with gin_trgm_ops. The frontend autocomplete relies on
-- this — operator typing "acm" finds "Glacme Holdings" too.
-- Idempotent — safe across re-runs.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hubspot_company_id" text NOT NULL,
	"name" text NOT NULL,
	"company_type" text,
	"segment_type" text,
	"lifecycle_stage" text,
	"hs_task_label" text,
	"hubspot_created_at" timestamp with time zone NOT NULL,
	"hubspot_modified_at" timestamp with time zone NOT NULL,
	"hubspot_raw" jsonb NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_hubspot_company_id_unique" UNIQUE("hubspot_company_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hubspot_deal_id" text NOT NULL,
	"hubspot_company_id" text NOT NULL,
	"name" text NOT NULL,
	"stage" text,
	"pipeline_id" text,
	"amount" numeric(14, 2),
	"currency" text,
	"client_label" text,
	"agent_label" text,
	"business_vertical" text,
	"hubspot_created_at" timestamp with time zone NOT NULL,
	"hubspot_modified_at" timestamp with time zone NOT NULL,
	"hubspot_raw" jsonb NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "deals_hubspot_deal_id_unique" UNIQUE("hubspot_deal_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "deals" ADD CONSTRAINT "deals_hubspot_company_id_companies_hubspot_company_id_fk" FOREIGN KEY ("hubspot_company_id") REFERENCES "public"."companies"("hubspot_company_id") ON DELETE restrict ON UPDATE cascade;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_company_type_name_idx" ON "companies" USING btree ("company_type","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "companies_hubspot_modified_at_idx" ON "companies" USING btree ("hubspot_modified_at");--> statement-breakpoint
-- GIN trigram index for substring autocomplete: WHERE name ILIKE '%acm%'
-- becomes index-scannable. Drizzle Kit can't emit this yet so it's
-- hand-added here.
CREATE INDEX IF NOT EXISTS "companies_name_trgm_idx" ON "companies" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deals_company_created_at_idx" ON "deals" USING btree ("hubspot_company_id","hubspot_created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deals_stage_idx" ON "deals" USING btree ("stage");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "deals_hubspot_modified_at_idx" ON "deals" USING btree ("hubspot_modified_at");