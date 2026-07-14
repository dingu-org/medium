CREATE TYPE "public"."plan" AS ENUM('free', 'solo');--> statement-breakpoint
CREATE TABLE "conversation_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pt_id" uuid NOT NULL,
	"patient_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"local_day" date NOT NULL,
	"month_key" text NOT NULL,
	"first_message_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "limit_handoff_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pts" ADD COLUMN "plan" "plan" DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE "pts" ADD COLUMN "plan_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pts" ADD COLUMN "plan_lifetime" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "pts" ADD COLUMN "plan_downgraded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pts" ADD COLUMN "plan_step_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversation_days" ADD CONSTRAINT "conversation_days_pt_id_pts_id_fk" FOREIGN KEY ("pt_id") REFERENCES "public"."pts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_days" ADD CONSTRAINT "conversation_days_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_days" ADD CONSTRAINT "conversation_days_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_days_pt_patient_day_uq" ON "conversation_days" USING btree ("pt_id","patient_id","local_day");--> statement-breakpoint
CREATE INDEX "conversation_days_pt_month_idx" ON "conversation_days" USING btree ("pt_id","month_key");--> statement-breakpoint
-- Standard tenant isolation for the conversation metering fact table: a PT
-- reads only their own usage rows. The inbound pipeline writes via the
-- RLS-bypassing owner connection. (drizzle-kit does not emit RLS; this block
-- is hand-appended per repo convention — see 0016/0017.)
ALTER TABLE "conversation_days" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "conversation_days_tenant_isolation" ON "conversation_days"
	FOR ALL TO authenticated
	USING (pt_id = auth.uid())
	WITH CHECK (pt_id = auth.uid());