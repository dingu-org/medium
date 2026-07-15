CREATE INDEX "messages_conversation_created_at_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
-- Phase 7 (0010) and Phase 13 (0013) set REPLICA IDENTITY FULL on the tables in
-- the supabase_realtime publication, on the belief that FULL was needed for
-- postgres_changes column filters on UPDATE and DELETE. That is unsafe: Supabase
-- does NOT apply column filters to DELETE events, so a DELETE (e.g. the nightly
-- retention purge, or any FK cascade) emits the FULL old row — including
-- messages.content (patient health data) and pt_id — to every authenticated
-- subscriber of the table, across tenants. Revert to DEFAULT: DELETE then carries
-- only the primary-key UUID. INSERT is unaffected and UPDATE still carries the
-- full NEW tuple (pt_id + conversation_id), so realtime INSERT/UPDATE filtering is
-- unchanged; the app reads only payload.old.id (lib/hooks/realtime.ts useMessages).
ALTER TABLE "messages" REPLICA IDENTITY DEFAULT;--> statement-breakpoint
ALTER TABLE "conversations" REPLICA IDENTITY DEFAULT;--> statement-breakpoint
ALTER TABLE "appointments" REPLICA IDENTITY DEFAULT;--> statement-breakpoint
ALTER TABLE "events" REPLICA IDENTITY DEFAULT;--> statement-breakpoint
-- 0013 also set these three to FULL and published them; same leak class
-- (patients carries PII: name / phone / wa_id). Revert them too.
ALTER TABLE "patients" REPLICA IDENTITY DEFAULT;--> statement-breakpoint
ALTER TABLE "reminder_jobs" REPLICA IDENTITY DEFAULT;--> statement-breakpoint
ALTER TABLE "services" REPLICA IDENTITY DEFAULT;
