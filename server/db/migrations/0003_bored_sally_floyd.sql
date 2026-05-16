CREATE TABLE "document_number_sequence" (
	"id" uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid NOT NULL,
	"next_value" integer NOT NULL,
	CONSTRAINT "document_number_sequence_singleton_check" CHECK ("document_number_sequence"."id" = '00000000-0000-0000-0000-000000000001'::uuid)
);
--> statement-breakpoint
CREATE TABLE "documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"company_id" uuid NOT NULL,
	"hubspot_deal_id" text,
	"calculator_config_id" uuid,
	"scope" text NOT NULL,
	"payload" jsonb NOT NULL,
	"addendum" text,
	"hubspot_sync_state" text DEFAULT 'not_synced' NOT NULL,
	"hubspot_note_id" text,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documents_number_unique" UNIQUE("number"),
	CONSTRAINT "documents_scope_check" CHECK ("documents"."scope" IN ('offer', 'agreement', 'offer_and_agreement')),
	CONSTRAINT "documents_sync_state_check" CHECK ("documents"."hubspot_sync_state" IN ('not_synced', 'synced', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_hubspot_deal_id_deals_hubspot_deal_id_fk" FOREIGN KEY ("hubspot_deal_id") REFERENCES "public"."deals"("hubspot_deal_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_calculator_config_id_calculator_configs_id_fk" FOREIGN KEY ("calculator_config_id") REFERENCES "public"."calculator_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_company_created_idx" ON "documents" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_deal_created_idx" ON "documents" USING btree ("hubspot_deal_id","created_at");--> statement-breakpoint
CREATE INDEX "documents_created_by_idx" ON "documents" USING btree ("created_by_user_id","created_at");--> statement-breakpoint
-- Seed the singleton sequence row. Starting value matches the
-- `DOCUMENT_NUMBER_START` decision in decisions.md (7100001).
-- Idempotent — re-running the migration won't reset the counter
-- because the PK is fixed and ON CONFLICT skips.
INSERT INTO "document_number_sequence" ("id", "next_value")
VALUES ('00000000-0000-0000-0000-000000000001', 7100001)
ON CONFLICT ("id") DO NOTHING;