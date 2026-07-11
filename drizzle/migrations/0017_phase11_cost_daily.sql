CREATE TABLE "cost_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pt_id" uuid NOT NULL,
	"day" date NOT NULL,
	"ai_cost_microusd" bigint DEFAULT 0 NOT NULL,
	"ai_cached_tokens" bigint DEFAULT 0 NOT NULL,
	"meta_conversations" integer DEFAULT 0 NOT NULL,
	"meta_cost_micro_eur" bigint DEFAULT 0 NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cost_daily" ADD CONSTRAINT "cost_daily_pt_id_pts_id_fk" FOREIGN KEY ("pt_id") REFERENCES "public"."pts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cost_daily_pt_day_uq" ON "cost_daily" USING btree ("pt_id","day");--> statement-breakpoint
-- Standard tenant isolation: a PT reads/writes only their own rollup rows. The
-- daily cron writes via the RLS-bypassing owner connection; the admin dashboard
-- reads cross-tenant via the same owner connection, gated at the app layer by
-- ADMIN_EMAILS. (drizzle-kit does not emit RLS; this block is hand-appended.)
ALTER TABLE "cost_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "cost_daily_tenant_isolation" ON "cost_daily"
	FOR ALL TO authenticated
	USING (pt_id = auth.uid())
	WITH CHECK (pt_id = auth.uid());