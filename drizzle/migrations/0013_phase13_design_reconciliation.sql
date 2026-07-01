CREATE TABLE "services" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pt_id" uuid NOT NULL,
	"name" text NOT NULL,
	"duration_min" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "services_name_not_blank" CHECK (length(btrim("services"."name")) > 0),
	CONSTRAINT "services_duration_range" CHECK ("services"."duration_min" BETWEEN 5 AND 480)
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "last_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_pt_id_pts_id_fk" FOREIGN KEY ("pt_id") REFERENCES "public"."pts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "services_pt_name_uq" ON "services" USING btree ("pt_id",lower(btrim("name")));--> statement-breakpoint
CREATE INDEX "services_pt_active_idx" ON "services" USING btree ("pt_id","active","created_at");--> statement-breakpoint
CREATE INDEX "conversations_pt_closed_last_inbound_idx" ON "conversations" USING btree ("pt_id","closed_at","last_inbound_at" DESC NULLS LAST);--> statement-breakpoint

-- Use the most recently observed duration for each historical service name.
INSERT INTO "services" ("pt_id", "name", "duration_min")
SELECT DISTINCT ON (a."pt_id", lower(btrim(a."service_type")))
  a."pt_id",
  btrim(a."service_type"),
  greatest(
    5,
    least(480, round(extract(epoch FROM (a."ends_at" - a."starts_at")) / 60)::integer)
  )
FROM "appointments" a
WHERE a."service_type" IS NOT NULL
  AND btrim(a."service_type") <> ''
  AND a."ends_at" > a."starts_at"
ORDER BY a."pt_id", lower(btrim(a."service_type")), a."created_at" DESC
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- New and history-free practices start with the three services from the design.
INSERT INTO "services" ("pt_id", "name", "duration_min", "active")
SELECT p."id", preset."name", preset."duration_min", preset."active"
FROM "pts" p
CROSS JOIN (
  VALUES
    ('Vlerësim i parë', 45, true),
    ('Seancë vijuese', 30, true),
    ('Terapi manuale', 60, false)
) AS preset("name", "duration_min", "active")
WHERE NOT EXISTS (
  SELECT 1 FROM "services" s WHERE s."pt_id" = p."id"
);--> statement-breakpoint

ALTER TABLE "services" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
GRANT ALL ON TABLE "services" TO postgres, anon, authenticated, service_role;--> statement-breakpoint
CREATE POLICY "services_tenant_isolation" ON "services"
  FOR ALL TO authenticated
  USING (pt_id = auth.uid())
  WITH CHECK (pt_id = auth.uid());--> statement-breakpoint

-- These records feed the Today, Clients, and Services read models.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;--> statement-breakpoint
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['patients','reminder_jobs','services']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;--> statement-breakpoint
ALTER TABLE "patients" REPLICA IDENTITY FULL;--> statement-breakpoint
ALTER TABLE "reminder_jobs" REPLICA IDENTITY FULL;--> statement-breakpoint
ALTER TABLE "services" REPLICA IDENTITY FULL;
--> statement-breakpoint

-- Keep new practices aligned with the onboarding presets after this migration.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.pts (id, email, timezone, retention_days)
  VALUES (NEW.id, NEW.email, 'Europe/Berlin', 90);

  INSERT INTO public.services (pt_id, name, duration_min, active)
  VALUES
    (NEW.id, 'Vlerësim i parë', 45, true),
    (NEW.id, 'Seancë vijuese', 30, true),
    (NEW.id, 'Terapi manuale', 60, false);
  RETURN NEW;
END;
$$;
