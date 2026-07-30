CREATE TABLE "wa_message_statuses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pt_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"last_status" text NOT NULL,
	"sent_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"read_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"billable" boolean,
	"pricing_category" text,
	"pricing_type" text,
	"pricing_model" text,
	"error_code" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cost_daily" ADD COLUMN "meta_billable_messages" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "cost_daily" ADD COLUMN "meta_cost_source" text DEFAULT 'estimated' NOT NULL;--> statement-breakpoint
ALTER TABLE "reminder_jobs" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "wa_message_statuses" ADD CONSTRAINT "wa_message_statuses_pt_id_pts_id_fk" FOREIGN KEY ("pt_id") REFERENCES "public"."pts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "wa_message_statuses_external_id_uq" ON "wa_message_statuses" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "wa_message_statuses_pt_delivered_idx" ON "wa_message_statuses" USING btree ("pt_id","delivered_at");--> statement-breakpoint
CREATE INDEX "wa_message_statuses_pt_created_idx" ON "wa_message_statuses" USING btree ("pt_id","created_at");--> statement-breakpoint
CREATE INDEX "reminder_jobs_pt_delivered_idx" ON "reminder_jobs" USING btree ("pt_id","delivered_at") WHERE delivered_at IS NOT NULL;--> statement-breakpoint
-- Deny-all RLS: Meta billing-truth is operator data, not PT-facing. The
-- statuses webhook writes via the service-role owner connection (bypasses RLS);
-- authenticated tenants can neither read nor write it. Mirrors the
-- erasure_archive posture (0016). drizzle-kit does not emit RLS; hand-appended
-- per repo convention (see 0016/0017/0020). The explicit GRANT (as in 0012/0013)
-- makes a denied query return zero rows instead of a permission error.
--
-- CORRECTION (0024): `GRANT ALL` is NOT the convention to copy. Only SELECT is
-- needed to turn a denied read into zero rows; the rest of `ALL` is what handed
-- anon/authenticated INSERT/UPDATE/DELETE on this table, and 0024 had to revoke
-- them schema-wide. A new table wants `GRANT SELECT ON TABLE "x" TO anon,
-- authenticated`.
GRANT ALL ON TABLE "wa_message_statuses" TO postgres, anon, authenticated, service_role;--> statement-breakpoint
ALTER TABLE "wa_message_statuses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "wa_message_statuses_tenant_isolation" ON "wa_message_statuses"
	FOR ALL TO authenticated
	USING (false)
	WITH CHECK (false);