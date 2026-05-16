CREATE TABLE "calculator_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"hubspot_deal_id" text,
	"title" text,
	"payload" jsonb NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calculator_configs" ADD CONSTRAINT "calculator_configs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculator_configs" ADD CONSTRAINT "calculator_configs_hubspot_deal_id_deals_hubspot_deal_id_fk" FOREIGN KEY ("hubspot_deal_id") REFERENCES "public"."deals"("hubspot_deal_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calculator_configs" ADD CONSTRAINT "calculator_configs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calculator_configs_company_deal_created_idx" ON "calculator_configs" USING btree ("company_id","hubspot_deal_id","created_at");--> statement-breakpoint
CREATE INDEX "calculator_configs_created_by_idx" ON "calculator_configs" USING btree ("created_by_user_id","created_at");