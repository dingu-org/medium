-- Guided-onboarding funnel trail (MED-125). One row per (account, step, outcome):
-- when a screen was shown and how it ended (completed / skipped / not_applicable).
--
-- WHY a separate table and not `events`: `events` is the domain log, every row is
-- written with an outbox row and published to Inngest, and the nightly purge
-- deletes it after retention_days. A funnel row has no consumer, must outlive 90
-- days to be read over weeks, and would be the one special case the outbox
-- invariant forbids. PostHog and Sentry are deliberately absent (cookie audit).
--
-- WHY it holds no content: there is no jsonb and no free-text column. Only the
-- step id, the outcome, a flow version and the environment name fit, so a name,
-- address or price cannot end up here. The unique index makes refresh, Back and
-- retries idempotent. Rows cascade with the account and are in the data export.
CREATE TYPE "public"."onboarding_event_outcome" AS ENUM('shown', 'completed', 'skipped', 'not_applicable');--> statement-breakpoint
CREATE TYPE "public"."onboarding_step" AS ENUM('intro', 'business', 'services', 'where', 'availability', 'whatsapp', 'notifications', 'finish');--> statement-breakpoint
CREATE TABLE "onboarding_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"step" "onboarding_step" NOT NULL,
	"outcome" "onboarding_event_outcome" NOT NULL,
	"flow_version" smallint NOT NULL,
	"app_env" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_events_app_env_valid" CHECK ("onboarding_events"."app_env" IN ('development', 'preview', 'production'))
);
--> statement-breakpoint
ALTER TABLE "onboarding_events" ADD CONSTRAINT "onboarding_events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "onboarding_events_account_step_outcome_uq" ON "onboarding_events" USING btree ("account_id","step","outcome");--> statement-breakpoint

-- Deny-all RLS, hand-appended per repo convention (drizzle-kit emits neither RLS
-- nor grants; same block as 0026 reminder_deliveries). Funnel rows are operator
-- data written only through the RLS-bypassing owner connection; the SELECT grant
-- turns a denied read into zero rows instead of a 42501 (0024's convention).
GRANT ALL ON TABLE "onboarding_events" TO postgres, service_role;--> statement-breakpoint
GRANT SELECT ON TABLE "onboarding_events" TO anon, authenticated;--> statement-breakpoint
ALTER TABLE "onboarding_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "onboarding_events_tenant_isolation" ON "onboarding_events"
	FOR SELECT TO authenticated
	USING (false);
