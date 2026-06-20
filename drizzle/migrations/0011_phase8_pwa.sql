CREATE TABLE "pwa_mutations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pt_id" uuid NOT NULL,
	"client_mutation_id" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"result" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pwa_mutations" ADD CONSTRAINT "pwa_mutations_pt_id_pts_id_fk" FOREIGN KEY ("pt_id") REFERENCES "public"."pts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pwa_mutations_pt_client_id_uq" ON "pwa_mutations" USING btree ("pt_id","client_mutation_id");--> statement-breakpoint
CREATE INDEX "pwa_mutations_pt_status_idx" ON "pwa_mutations" USING btree ("pt_id","status","created_at");--> statement-breakpoint
ALTER TABLE "pwa_mutations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "pwa_mutations_tenant_isolation" ON "pwa_mutations"
  FOR ALL TO authenticated
  USING (pt_id = auth.uid())
  WITH CHECK (pt_id = auth.uid());
