CREATE TYPE "public"."coexistence_sync_status" AS ENUM('not_applicable', 'pending', 'syncing', 'complete', 'failed', 'history_declined');--> statement-breakpoint
CREATE TYPE "public"."whatsapp_connection_mode" AS ENUM('cloud_api', 'coexistence');--> statement-breakpoint
CREATE TABLE "whatsapp_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pt_id" uuid NOT NULL,
	"phone" text NOT NULL,
	"wa_id" text,
	"full_name" text,
	"first_name" text,
	"source_action" text,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "ai_paused_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "ai_pause_reason" text;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD COLUMN "mode" "whatsapp_connection_mode" DEFAULT 'cloud_api' NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD COLUMN "coexistence_sync_status" "coexistence_sync_status" DEFAULT 'not_applicable' NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD COLUMN "coexistence_sync_deadline_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD COLUMN "coexistence_contacts_request_id" text;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD COLUMN "coexistence_history_request_id" text;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD COLUMN "coexistence_last_progress" integer;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD COLUMN "coexistence_last_error" text;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_pt_id_pts_id_fk" FOREIGN KEY ("pt_id") REFERENCES "public"."pts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_contacts_pt_phone_uq" ON "whatsapp_contacts" USING btree ("pt_id","phone");--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_contacts_pt_wa_id_uq" ON "whatsapp_contacts" USING btree ("pt_id","wa_id") WHERE "whatsapp_contacts"."wa_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "conversations_ai_pause_idx" ON "conversations" USING btree ("pt_id","ai_paused_until") WHERE "conversations"."ai_paused_until" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT ALL ON TABLE "whatsapp_contacts" TO postgres, anon, authenticated, service_role;--> statement-breakpoint
CREATE POLICY "whatsapp_contacts_tenant_isolation" ON "whatsapp_contacts"
  FOR ALL TO authenticated
  USING (pt_id = auth.uid())
  WITH CHECK (pt_id = auth.uid());
