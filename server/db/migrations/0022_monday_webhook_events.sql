-- monday migration, step 3 — inbound webhook queue (2026-08-27).
--
-- A SEPARATE table rather than widening `hubspot_webhook_events`, because
-- the two payloads have nothing in common beyond "something changed":
-- HubSpot supplies a unique `eventId` and a flat subscriptionType; monday
-- supplies neither and identifies the object by (boardId, pulseId).
-- Widening would have meant nullable columns on both sides and a CHECK
-- that no longer means anything.
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "monday_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SYNTHETIC idempotency key. monday sends no delivery-unique id and
  -- retries the identical payload every minute for 30 minutes, so the key
  -- is derived from the event's own content:
  --   md5(board_id : pulse_id : event_type : trigger_time)
  -- Two genuinely distinct changes to the same column in the same
  -- millisecond would collapse into one — acceptable, because the
  -- processor re-reads the item from the API anyway and would fetch the
  -- same final state either way.
  "event_key" text NOT NULL UNIQUE,
  "event_type" text NOT NULL,
  "board_id" text NOT NULL,
  "item_id" text NOT NULL,
  -- 'company' | 'agent' | 'deal', derived from which board fired.
  "object_type" text NOT NULL,
  "occurred_at" timestamptz NOT NULL,
  "received_at" timestamptz NOT NULL DEFAULT now(),
  "status" text NOT NULL DEFAULT 'pending',
  "outcome" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "last_error" text,
  "processed_at" timestamptz,
  -- The raw delivery, kept for debugging. NOT a data source: the
  -- processor re-fetches every field from the API, so a forged or
  -- tampered payload can at worst cause a wasted read.
  "raw" jsonb NOT NULL,
  CONSTRAINT "monday_webhook_events_status_check"
    CHECK ("status" IN ('pending', 'processed', 'failed')),
  CONSTRAINT "monday_webhook_events_outcome_check"
    CHECK ("outcome" IS NULL OR "outcome" IN ('upserted', 'flagged_deleted', 'restored', 'skipped')),
  CONSTRAINT "monday_webhook_events_object_type_check"
    CHECK ("object_type" IN ('company', 'agent', 'deal'))
);
--> statement-breakpoint

-- Worker hot path: pending rows, oldest first, with the retry backoff
-- evaluated without a heap re-check.
CREATE INDEX IF NOT EXISTS "monday_webhook_events_pending_idx"
  ON "monday_webhook_events" ("occurred_at", "received_at", "attempts")
  WHERE "status" = 'pending';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "monday_webhook_events_item_idx"
  ON "monday_webhook_events" ("object_type", "item_id", "occurred_at");
