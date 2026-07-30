-- WHY: every tenant policy (0002 and the per-phase blocks in 0007/0011/0012/
-- 0013/0016/0017/0020) was created `FOR ALL TO authenticated` with a symmetric
-- WITH CHECK, and anon/authenticated already hold INSERT/UPDATE/DELETE on every
-- table in `public`. Those grants come from the repo, not from Supabase: the
-- `GRANT ALL ON ALL TABLES` that scripts/db-reset.ts runs after migrating, and
-- the per-table `GRANT ALL ON TABLE` in 0012/0013/0021/0022. The public schema is
-- exposed on /rest/v1 and the anon key ships in the browser bundle, so a PT
-- holding their own access token could write their own rows straight through
-- PostgREST: self-granting the paid plan (`pts.plan` / `pts.plan_lifetime`, which
-- lib/billing/entitlements.ts trusts), erasing their `audit_log` trail, raising
-- `pts.retention_days` past the GDPR purge, or resetting the metered counters in
-- `conversation_days` / `reminder_jobs`. The same channel let a tenant forge
-- `event_outbox` rows that the publisher republishes as trusted Inngest events.
--
-- No application path writes through PostgREST: every read and write goes
-- through Drizzle as the table owner (DATABASE_URL), and the supabase-js browser
-- client is used only for auth and for Realtime `postgres_changes`, which needs
-- SELECT only. So the tenant surface becomes read-only: revoke the write
-- privileges and narrow every `FOR ALL` policy to `FOR SELECT`, keeping the
-- existing per-tenant USING predicate so Realtime keeps delivering. This is the
-- posture 0022 already chose for the `billing_orders` money ledger, now applied
-- to the whole schema.
--
-- CONVENTION for every migration after this one: a new table gets
-- `GRANT SELECT ON TABLE "x" TO anon, authenticated` (which still turns a denied
-- read into zero rows rather than a 42501), never `GRANT ALL` — see the
-- corrected notes in 0021/0022. scripts/db-reset.ts re-grants the same way.
--
-- The ALTER DEFAULT PRIVILEGES below is a no-op on the local Supabase image:
-- pg_default_acl has no row for schema `public` there, so nothing re-grants
-- writes on the next CREATE TABLE. It stays because hosted Supabase does ship
-- that default and this must not depend on which one you are looking at.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA "public" FROM anon, authenticated;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLES FROM anon, authenticated;--> statement-breakpoint

-- pts is special: the row's own id IS the tenant id (auth.users.id).
DROP POLICY "pts_tenant_isolation" ON "pts";--> statement-breakpoint
CREATE POLICY "pts_tenant_isolation" ON "pts"
	FOR SELECT TO authenticated
	USING (id = auth.uid());--> statement-breakpoint

DROP POLICY "whatsapp_connections_tenant_isolation" ON "whatsapp_connections";--> statement-breakpoint
CREATE POLICY "whatsapp_connections_tenant_isolation" ON "whatsapp_connections"
	FOR SELECT TO authenticated
	USING (pt_id = auth.uid());--> statement-breakpoint

DROP POLICY "whatsapp_contacts_tenant_isolation" ON "whatsapp_contacts";--> statement-breakpoint
CREATE POLICY "whatsapp_contacts_tenant_isolation" ON "whatsapp_contacts"
	FOR SELECT TO authenticated
	USING (pt_id = auth.uid());--> statement-breakpoint

DROP POLICY "patients_tenant_isolation" ON "patients";--> statement-breakpoint
CREATE POLICY "patients_tenant_isolation" ON "patients"
	FOR SELECT TO authenticated
	USING (pt_id = auth.uid());--> statement-breakpoint

DROP POLICY "services_tenant_isolation" ON "services";--> statement-breakpoint
CREATE POLICY "services_tenant_isolation" ON "services"
	FOR SELECT TO authenticated
	USING (pt_id = auth.uid());--> statement-breakpoint

DROP POLICY "conversations_tenant_isolation" ON "conversations";--> statement-breakpoint
CREATE POLICY "conversations_tenant_isolation" ON "conversations"
	FOR SELECT TO authenticated
	USING (pt_id = auth.uid());--> statement-breakpoint

DROP POLICY "messages_tenant_isolation" ON "messages";--> statement-breakpoint
CREATE POLICY "messages_tenant_isolation" ON "messages"
	FOR SELECT TO authenticated
	USING (pt_id = auth.uid());--> statement-breakpoint

DROP POLICY "appointments_tenant_isolation" ON "appointments";--> statement-breakpoint
CREATE POLICY "appointments_tenant_isolation" ON "appointments"
	FOR SELECT TO authenticated
	USING (pt_id = auth.uid());--> statement-breakpoint

DROP POLICY "availability_rules_tenant_isolation" ON "availability_rules";--> statement-breakpoint
CREATE POLICY "availability_rules_tenant_isolation" ON "availability_rules"
	FOR SELECT TO authenticated
	USING (pt_id = auth.uid());--> statement-breakpoint

DROP POLICY "blocked_periods_tenant_isolation" ON "blocked_periods";--> statement-breakpoint
CREATE POLICY "blocked_periods_tenant_isolation" ON "blocked_periods"
	FOR SELECT TO authenticated
	USING (pt_id = auth.uid());--> statement-breakpoint

DROP POLICY "message_templates_tenant_isolation" ON "message_templates";--> statement-breakpoint
CREATE POLICY "message_templates_tenant_isolation" ON "message_templates"
	FOR SELECT TO authenticated
	USING (pt_id = auth.uid());--> statement-breakpoint

DROP POLICY "reminder_jobs_tenant_isolation" ON "reminder_jobs";--> statement-breakpoint
CREATE POLICY "reminder_jobs_tenant_isolation" ON "reminder_jobs"
	FOR SELECT TO authenticated
	USING (pt_id = auth.uid());--> statement-breakpoint

DROP POLICY "push_subscriptions_tenant_isolation" ON "push_subscriptions";--> statement-breakpoint
CREATE POLICY "push_subscriptions_tenant_isolation" ON "push_subscriptions"
	FOR SELECT TO authenticated
	USING (pt_id = auth.uid());--> statement-breakpoint

DROP POLICY "pwa_mutations_tenant_isolation" ON "pwa_mutations";--> statement-breakpoint
CREATE POLICY "pwa_mutations_tenant_isolation" ON "pwa_mutations"
	FOR SELECT TO authenticated
	USING (pt_id = auth.uid());--> statement-breakpoint

DROP POLICY "events_tenant_isolation" ON "events";--> statement-breakpoint
CREATE POLICY "events_tenant_isolation" ON "events"
	FOR SELECT TO authenticated
	USING (pt_id = auth.uid());--> statement-breakpoint

DROP POLICY "event_outbox_tenant_isolation" ON "event_outbox";--> statement-breakpoint
CREATE POLICY "event_outbox_tenant_isolation" ON "event_outbox"
	FOR SELECT TO authenticated
	USING (pt_id = auth.uid());--> statement-breakpoint

DROP POLICY "audit_log_tenant_isolation" ON "audit_log";--> statement-breakpoint
CREATE POLICY "audit_log_tenant_isolation" ON "audit_log"
	FOR SELECT TO authenticated
	USING (pt_id = auth.uid());--> statement-breakpoint

DROP POLICY "cost_daily_tenant_isolation" ON "cost_daily";--> statement-breakpoint
CREATE POLICY "cost_daily_tenant_isolation" ON "cost_daily"
	FOR SELECT TO authenticated
	USING (pt_id = auth.uid());--> statement-breakpoint

DROP POLICY "conversation_days_tenant_isolation" ON "conversation_days";--> statement-breakpoint
CREATE POLICY "conversation_days_tenant_isolation" ON "conversation_days"
	FOR SELECT TO authenticated
	USING (pt_id = auth.uid());--> statement-breakpoint

-- erasure_archive (0016) and wa_message_statuses (0021) stay deny-all: they are
-- operator/compliance records, not PT-facing. The policy keeps the same USING
-- (false) predicate, only narrowed to SELECT now that writes are revoked.
DROP POLICY "erasure_archive_tenant_isolation" ON "erasure_archive";--> statement-breakpoint
CREATE POLICY "erasure_archive_tenant_isolation" ON "erasure_archive"
	FOR SELECT TO authenticated
	USING (false);--> statement-breakpoint

DROP POLICY "wa_message_statuses_tenant_isolation" ON "wa_message_statuses";--> statement-breakpoint
CREATE POLICY "wa_message_statuses_tenant_isolation" ON "wa_message_statuses"
	FOR SELECT TO authenticated
	USING (false);
