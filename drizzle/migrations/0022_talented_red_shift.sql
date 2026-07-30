CREATE TYPE "public"."billing_order_status" AS ENUM('created', 'paid', 'failed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."billing_period" AS ENUM('monthly', 'yearly');--> statement-breakpoint
CREATE TABLE "billing_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pt_id" uuid NOT NULL,
	"pok_order_id" text NOT NULL,
	"plan" "plan" NOT NULL,
	"period" "billing_period" NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text DEFAULT 'ALL' NOT NULL,
	"status" "billing_order_status" DEFAULT 'created' NOT NULL,
	"previous_expires_at" timestamp with time zone,
	"new_expires_at" timestamp with time zone,
	"pok_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "billing_orders" ADD CONSTRAINT "billing_orders_pt_id_pts_id_fk" FOREIGN KEY ("pt_id") REFERENCES "public"."pts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "billing_orders_pok_order_id_uq" ON "billing_orders" USING btree ("pok_order_id");--> statement-breakpoint
CREATE INDEX "billing_orders_pt_created_idx" ON "billing_orders" USING btree ("pt_id","created_at");--> statement-breakpoint
CREATE INDEX "billing_orders_pending_idx" ON "billing_orders" USING btree ("created_at") WHERE status = 'created';--> statement-breakpoint
-- RLS: read-own, no write policy. This is the money ledger — tenants must never
-- INSERT/UPDATE/DELETE (omitting those policies denies them by default; every
-- write goes through the RLS-bypassing owner connection in payments.ts), but a
-- PT SHOULD read their own receipts (C6 /settings/billing). Deliberately
-- narrower than the repo's default FOR ALL. drizzle-kit does not emit RLS; this
-- block is hand-appended per repo convention (see 0012/0013/0020/0021). The
-- explicit GRANT makes a denied query return zero rows instead of a 42501 error.
--
-- CORRECTION (0024): `GRANT ALL` is NOT the convention to copy. Only SELECT is
-- needed for the zero-rows behaviour; the rest of `ALL` is what handed
-- anon/authenticated INSERT/UPDATE/DELETE on this ledger, and 0024 had to revoke
-- them schema-wide. A new table wants `GRANT SELECT ON TABLE "x" TO anon,
-- authenticated`.
GRANT ALL ON TABLE "billing_orders" TO postgres, anon, authenticated, service_role;--> statement-breakpoint
ALTER TABLE "billing_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "billing_orders_tenant_isolation" ON "billing_orders"
	FOR SELECT TO authenticated
	USING (pt_id = auth.uid());