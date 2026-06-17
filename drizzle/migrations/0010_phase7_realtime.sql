ALTER TABLE "pts" ADD COLUMN "notification_prefs" jsonb;--> statement-breakpoint
ALTER TABLE "pts" ADD COLUMN "notifications_seen_at" timestamp with time zone;--> statement-breakpoint
-- Phase 7: enable Supabase Realtime for the tables the PWA subscribes to.
-- The `supabase_realtime` publication ships by default on hosted Supabase; create
-- it if absent (e.g. a bare local Postgres) so this migration is self-contained.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;--> statement-breakpoint
-- Add each table to the publication only if not already a member (idempotent).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['appointments','messages','conversations','events']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;--> statement-breakpoint
-- REPLICA IDENTITY FULL so postgres_changes filters on pt_id / conversation_id
-- work for UPDATE and DELETE (old row otherwise only carries the primary key).
ALTER TABLE "appointments" REPLICA IDENTITY FULL;--> statement-breakpoint
ALTER TABLE "messages" REPLICA IDENTITY FULL;--> statement-breakpoint
ALTER TABLE "conversations" REPLICA IDENTITY FULL;--> statement-breakpoint
ALTER TABLE "events" REPLICA IDENTITY FULL;