-- NOTE: plain (non-concurrent) CREATE INDEX — fine for fresh/empty test + local
-- databases where drizzle-kit applies this in a transaction. On PRODUCTION these
-- indexes must be built with CREATE INDEX CONCURRENTLY (which cannot run inside a
-- migration transaction) to avoid locking writes on the large `messages` table;
-- run that manually first. IF NOT EXISTS keeps this file a safe no-op afterwards.
CREATE INDEX IF NOT EXISTS "appointments_pt_created_at_idx" ON "appointments" USING btree ("pt_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "events_type_occurred_at_idx" ON "events" USING btree ("type","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_pt_created_at_idx" ON "messages" USING btree ("pt_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "messages_created_at_idx" ON "messages" USING btree ("created_at");
