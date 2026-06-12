ALTER TYPE "public"."reminder_status" ADD VALUE 'requeued' BEFORE 'sent';--> statement-breakpoint
ALTER TYPE "public"."reminder_status" ADD VALUE 'skipped' BEFORE 'failed';--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "source_event_id" uuid;--> statement-breakpoint
ALTER TABLE "reminder_jobs" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_jobs" ADD COLUMN "last_error" text;--> statement-breakpoint
ALTER TABLE "reminder_jobs" ADD COLUMN "skipped_reason" text;--> statement-breakpoint
ALTER TABLE "reminder_jobs" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reminder_jobs" ADD COLUMN "message_id" uuid;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD COLUMN "token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD COLUMN "expiry_warning_sent_at" timestamp with time zone;--> statement-breakpoint
UPDATE "whatsapp_connections"
SET "token_expires_at" = COALESCE("connected_at", "created_at") + interval '60 days'
WHERE "status" = 'active' AND "token_expires_at" IS NULL;--> statement-breakpoint
ALTER TABLE "reminder_jobs" ADD CONSTRAINT "reminder_jobs_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_source_event_id_uq" ON "messages" USING btree ("source_event_id") WHERE source_event_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_jobs_appointment_id_uq" ON "reminder_jobs" USING btree ("appointment_id");
