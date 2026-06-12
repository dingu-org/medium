CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
CREATE TYPE "public"."cancellation_actor" AS ENUM('patient', 'pt', 'ai');--> statement-breakpoint
CREATE TABLE "event_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pt_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "cancelled_by" "cancellation_actor";--> statement-breakpoint
ALTER TABLE "appointments" ADD COLUMN "cancellation_reason" text;--> statement-breakpoint
ALTER TABLE "event_outbox" ADD CONSTRAINT "event_outbox_pt_id_pts_id_fk" FOREIGN KEY ("pt_id") REFERENCES "public"."pts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_outbox" ADD CONSTRAINT "event_outbox_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_outbox_event_id_uq" ON "event_outbox" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "event_outbox_due_idx" ON "event_outbox" USING btree ("available_at") WHERE published_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "appointments_active_idempotency_uq" ON "appointments" USING btree ("pt_id","patient_id","starts_at") WHERE status IN ('pending', 'confirmed');--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_valid_range" CHECK ("appointments"."ends_at" > "appointments"."starts_at");--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_valid_weekday" CHECK ("availability_rules"."weekday" BETWEEN 0 AND 6);--> statement-breakpoint
ALTER TABLE "availability_rules" ADD CONSTRAINT "availability_rules_valid_range" CHECK ("availability_rules"."end_time" > "availability_rules"."start_time");--> statement-breakpoint
ALTER TABLE "blocked_periods" ADD CONSTRAINT "blocked_periods_valid_range" CHECK ("blocked_periods"."ends_at" > "blocked_periods"."starts_at");--> statement-breakpoint
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_active_overlap" EXCLUDE USING gist (
	"pt_id" WITH =,
	tstzrange("starts_at", "ends_at", '[)') WITH &&
) WHERE ("status" IN ('pending', 'confirmed'));--> statement-breakpoint
ALTER TABLE "event_outbox" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "event_outbox_tenant_isolation" ON "event_outbox"
	FOR ALL TO authenticated
	USING ("pt_id" = auth.uid())
	WITH CHECK ("pt_id" = auth.uid());
