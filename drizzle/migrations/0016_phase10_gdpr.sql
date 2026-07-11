CREATE TABLE "erasure_archive" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pt_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"target_id" uuid,
	"before_state_hash" text,
	"metadata" jsonb,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "erasure_archive_scope_check" CHECK ("erasure_archive"."scope" in ('patient','account'))
);
--> statement-breakpoint
-- Deny-all RLS: this compliance record is service-role-only and must survive the
-- PT deletion it documents. Service-role seeding bypasses RLS, so inserts still
-- work; authenticated tenants can neither read nor write it. If PTs ever need to
-- read their own archive, switch USING to (pt_id = auth.uid()).
ALTER TABLE "erasure_archive" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "erasure_archive_tenant_isolation" ON "erasure_archive"
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);
