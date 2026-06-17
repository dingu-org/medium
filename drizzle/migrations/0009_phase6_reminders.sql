CREATE TYPE "public"."reminder_response_type" AS ENUM('confirm', 'cancel', 'reschedule_requested', 'opt_out');--> statement-breakpoint
ALTER TABLE "patients" ADD COLUMN "reminder_opted_out_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reminder_jobs" ADD COLUMN "response_type" "reminder_response_type";--> statement-breakpoint
ALTER TABLE "reminder_jobs" ADD COLUMN "responded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reminder_jobs" ADD COLUMN "response_message_id" uuid;--> statement-breakpoint
ALTER TABLE "reminder_jobs" ADD CONSTRAINT "reminder_jobs_response_message_id_messages_id_fk" FOREIGN KEY ("response_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_jobs_response_message_id_uq" ON "reminder_jobs" USING btree ("response_message_id") WHERE response_message_id IS NOT NULL;