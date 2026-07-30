-- WHY: 0024 revoked INSERT/UPDATE/DELETE/TRUNCATE from anon/authenticated, but
-- it named the write privileges it could think of. `GRANT ALL ON TABLE` (still
-- in 0012/0013/0021/0022, which run before 0024 on a fresh database) also hands
-- out REFERENCES, TRIGGER and — on PG17 — MAINTAIN, so four tables came out of a
-- migration run at anon=rxtm/authenticated=rxtm instead of the intended r:
-- billing_orders, services, wa_message_statuses, whatsapp_contacts.
--
-- TRIGGER is the one that matters: CREATE TRIGGER attaches a function that then
-- executes with the table OWNER's rights, which is a privilege-escalation
-- primitive against a schema where the owner bypasses RLS. It is not exploitable
-- today — has_schema_privilege('authenticated','public','CREATE') is false, so a
-- tenant has nowhere to put the trigger function, and PostgREST issues no DDL —
-- but the grant buys nothing and the next schema-level grant change should not
-- be what makes it reachable. REFERENCES (FK onto another tenant's table) and
-- MAINTAIN (VACUUM/ANALYZE/REFRESH) are the same story: unused, so revoked.
--
-- MAINTAIN is PG17+; on an older server the REVOKE errors out and would abort
-- the rest of the migration, so it is guarded on server_version_num rather than
-- assuming which Postgres the target runs.
REVOKE REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA "public" FROM anon, authenticated;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE REFERENCES, TRIGGER ON TABLES FROM anon, authenticated;--> statement-breakpoint
DO $$
BEGIN
	IF current_setting('server_version_num')::int >= 170000 THEN
		EXECUTE 'REVOKE MAINTAIN ON ALL TABLES IN SCHEMA "public" FROM anon, authenticated';
		EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE MAINTAIN ON TABLES FROM anon, authenticated';
	END IF;
END
$$;
