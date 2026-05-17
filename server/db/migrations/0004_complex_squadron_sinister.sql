CREATE TABLE "hubspot_webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hubspot_event_id" text NOT NULL,
	"subscription_type" text NOT NULL,
	"object_type" text NOT NULL,
	"hubspot_object_id" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"outcome" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"processed_at" timestamp with time zone,
	"raw" jsonb NOT NULL,
	CONSTRAINT "hubspot_webhook_events_hubspot_event_id_unique" UNIQUE("hubspot_event_id"),
	CONSTRAINT "hubspot_webhook_events_status_check" CHECK ("hubspot_webhook_events"."status" IN ('pending', 'processed', 'failed')),
	CONSTRAINT "hubspot_webhook_events_outcome_check" CHECK ("hubspot_webhook_events"."outcome" IS NULL OR "hubspot_webhook_events"."outcome" IN ('upserted', 'deleted', 'filtered_out')),
	CONSTRAINT "hubspot_webhook_events_object_type_check" CHECK ("hubspot_webhook_events"."object_type" IN ('company', 'deal'))
);
--> statement-breakpoint
CREATE INDEX "hubspot_webhook_events_pending_idx" ON "hubspot_webhook_events" USING btree ("occurred_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "hubspot_webhook_events_object_idx" ON "hubspot_webhook_events" USING btree ("object_type","hubspot_object_id","occurred_at");