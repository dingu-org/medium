-- Medium is horizontal: appointment booking for barbers, salons and
-- anyone else who books time, not a physiotherapy product. The schema
-- still spoke the old language, so this renames the tenant table and the
-- people it books:
--   pts -> accounts        pt_id -> account_id
--   patients -> customers  patient_id -> customer_id
--   practice_name -> name
-- Purely a rename: no column is added, dropped or retyped, and every
-- policy qual, index predicate and FK target follows automatically
-- because Postgres stores them as parse trees, not text.

-- Tables
ALTER TABLE "pts" RENAME TO "accounts";--> statement-breakpoint
ALTER TABLE "patients" RENAME TO "customers";--> statement-breakpoint

-- Columns
ALTER TABLE "appointments" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "audit_log" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "availability_rules" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "billing_orders" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "blocked_periods" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "conversation_days" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "conversations" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "cost_daily" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "erasure_archive" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "event_outbox" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "events" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "message_templates" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "messages" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "customers" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "push_subscriptions" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "pwa_mutations" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "reminder_deliveries" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "reminder_jobs" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "services" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "wa_message_statuses" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "whatsapp_connections" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" RENAME COLUMN "pt_id" TO "account_id";--> statement-breakpoint
ALTER TABLE "appointments" RENAME COLUMN "patient_id" TO "customer_id";--> statement-breakpoint
ALTER TABLE "conversation_days" RENAME COLUMN "patient_id" TO "customer_id";--> statement-breakpoint
ALTER TABLE "conversations" RENAME COLUMN "patient_id" TO "customer_id";--> statement-breakpoint
ALTER TABLE "accounts" RENAME COLUMN "practice_name" TO "name";--> statement-breakpoint

-- Constraints
ALTER TABLE "appointments" RENAME CONSTRAINT "appointments_patient_id_patients_id_fk" TO "appointments_customer_id_customers_id_fk";--> statement-breakpoint
ALTER TABLE "appointments" RENAME CONSTRAINT "appointments_pt_id_pts_id_fk" TO "appointments_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "audit_log" RENAME CONSTRAINT "audit_log_pt_id_pts_id_fk" TO "audit_log_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "availability_rules" RENAME CONSTRAINT "availability_rules_pt_id_pts_id_fk" TO "availability_rules_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "billing_orders" RENAME CONSTRAINT "billing_orders_pt_id_pts_id_fk" TO "billing_orders_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "blocked_periods" RENAME CONSTRAINT "blocked_periods_pt_id_pts_id_fk" TO "blocked_periods_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "conversation_days" RENAME CONSTRAINT "conversation_days_patient_id_patients_id_fk" TO "conversation_days_customer_id_customers_id_fk";--> statement-breakpoint
ALTER TABLE "conversation_days" RENAME CONSTRAINT "conversation_days_pt_id_pts_id_fk" TO "conversation_days_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "conversations" RENAME CONSTRAINT "conversations_patient_id_patients_id_fk" TO "conversations_customer_id_customers_id_fk";--> statement-breakpoint
ALTER TABLE "conversations" RENAME CONSTRAINT "conversations_pt_id_pts_id_fk" TO "conversations_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "cost_daily" RENAME CONSTRAINT "cost_daily_pt_id_pts_id_fk" TO "cost_daily_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "event_outbox" RENAME CONSTRAINT "event_outbox_pt_id_pts_id_fk" TO "event_outbox_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "events" RENAME CONSTRAINT "events_pt_id_pts_id_fk" TO "events_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "message_templates" RENAME CONSTRAINT "message_templates_pt_id_pts_id_fk" TO "message_templates_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "messages" RENAME CONSTRAINT "messages_pt_id_pts_id_fk" TO "messages_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "customers" RENAME CONSTRAINT "patients_pkey" TO "customers_pkey";--> statement-breakpoint
ALTER TABLE "customers" RENAME CONSTRAINT "patients_pt_id_pts_id_fk" TO "customers_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "accounts" RENAME CONSTRAINT "pts_id_auth_users_fk" TO "accounts_id_auth_users_fk";--> statement-breakpoint
ALTER TABLE "accounts" RENAME CONSTRAINT "pts_pkey" TO "accounts_pkey";--> statement-breakpoint
ALTER TABLE "push_subscriptions" RENAME CONSTRAINT "push_subscriptions_pt_id_pts_id_fk" TO "push_subscriptions_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "pwa_mutations" RENAME CONSTRAINT "pwa_mutations_pt_id_pts_id_fk" TO "pwa_mutations_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "reminder_deliveries" RENAME CONSTRAINT "reminder_deliveries_pt_id_pts_id_fk" TO "reminder_deliveries_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "reminder_jobs" RENAME CONSTRAINT "reminder_jobs_pt_id_pts_id_fk" TO "reminder_jobs_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "services" RENAME CONSTRAINT "services_pt_id_pts_id_fk" TO "services_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "wa_message_statuses" RENAME CONSTRAINT "wa_message_statuses_pt_id_pts_id_fk" TO "wa_message_statuses_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "whatsapp_connections" RENAME CONSTRAINT "whatsapp_connections_pt_id_pts_id_fk" TO "whatsapp_connections_account_id_accounts_id_fk";--> statement-breakpoint
ALTER TABLE "whatsapp_contacts" RENAME CONSTRAINT "whatsapp_contacts_pt_id_pts_id_fk" TO "whatsapp_contacts_account_id_accounts_id_fk";--> statement-breakpoint

-- Indexes (pkey indexes follow their constraint above)
ALTER INDEX "appointments_pt_created_at_idx" RENAME TO "appointments_account_created_at_idx";--> statement-breakpoint
ALTER INDEX "appointments_pt_starts_at_idx" RENAME TO "appointments_account_starts_at_idx";--> statement-breakpoint
ALTER INDEX "billing_orders_pt_created_idx" RENAME TO "billing_orders_account_created_idx";--> statement-breakpoint
ALTER INDEX "conversation_days_pt_month_idx" RENAME TO "conversation_days_account_month_idx";--> statement-breakpoint
ALTER INDEX "conversation_days_pt_patient_day_uq" RENAME TO "conversation_days_account_customer_day_uq";--> statement-breakpoint
ALTER INDEX "conversations_patient_channel_uq" RENAME TO "conversations_customer_channel_uq";--> statement-breakpoint
ALTER INDEX "conversations_pt_closed_last_inbound_idx" RENAME TO "conversations_account_closed_last_inbound_idx";--> statement-breakpoint
ALTER INDEX "conversations_pt_last_inbound_idx" RENAME TO "conversations_account_last_inbound_idx";--> statement-breakpoint
ALTER INDEX "cost_daily_pt_day_uq" RENAME TO "cost_daily_account_day_uq";--> statement-breakpoint
ALTER INDEX "events_pt_occurred_at_idx" RENAME TO "events_account_occurred_at_idx";--> statement-breakpoint
ALTER INDEX "messages_pt_created_at_idx" RENAME TO "messages_account_created_at_idx";--> statement-breakpoint
ALTER INDEX "patients_pt_wa_id_uq" RENAME TO "customers_account_wa_id_uq";--> statement-breakpoint
ALTER INDEX "pwa_mutations_pt_client_id_uq" RENAME TO "pwa_mutations_account_client_id_uq";--> statement-breakpoint
ALTER INDEX "pwa_mutations_pt_status_idx" RENAME TO "pwa_mutations_account_status_idx";--> statement-breakpoint
ALTER INDEX "reminder_deliveries_pt_delivered_idx" RENAME TO "reminder_deliveries_account_delivered_idx";--> statement-breakpoint
ALTER INDEX "reminder_jobs_pt_delivered_idx" RENAME TO "reminder_jobs_account_delivered_idx";--> statement-breakpoint
ALTER INDEX "services_pt_active_idx" RENAME TO "services_account_active_idx";--> statement-breakpoint
ALTER INDEX "services_pt_name_uq" RENAME TO "services_account_name_uq";--> statement-breakpoint
ALTER INDEX "wa_message_statuses_pt_created_idx" RENAME TO "wa_message_statuses_account_created_idx";--> statement-breakpoint
ALTER INDEX "wa_message_statuses_pt_delivered_idx" RENAME TO "wa_message_statuses_account_delivered_idx";--> statement-breakpoint
ALTER INDEX "whatsapp_contacts_pt_phone_uq" RENAME TO "whatsapp_contacts_account_phone_uq";--> statement-breakpoint
ALTER INDEX "whatsapp_contacts_pt_wa_id_uq" RENAME TO "whatsapp_contacts_account_wa_id_uq";--> statement-breakpoint

-- Policy names (the USING quals already track the renamed columns)
ALTER POLICY "pts_tenant_isolation" ON "accounts" RENAME TO "accounts_tenant_isolation";--> statement-breakpoint
ALTER POLICY "patients_tenant_isolation" ON "customers" RENAME TO "customers_tenant_isolation";--> statement-breakpoint

-- Enum labels. RENAME VALUE rewrites the label in place, so stored rows
-- stay valid and no data migration is needed.
ALTER TYPE "public"."message_role" RENAME VALUE 'patient' TO 'customer';--> statement-breakpoint
ALTER TYPE "public"."message_role" RENAME VALUE 'pt' TO 'account';--> statement-breakpoint
ALTER TYPE "public"."cancellation_actor" RENAME VALUE 'patient' TO 'customer';--> statement-breakpoint
ALTER TYPE "public"."cancellation_actor" RENAME VALUE 'pt' TO 'account';--> statement-breakpoint

-- erasure_archive.scope is plain text under a CHECK, not an enum, so the
-- rows move first and the constraint is swapped after.
UPDATE "erasure_archive" SET "scope" = 'customer' WHERE "scope" = 'patient';--> statement-breakpoint
ALTER TABLE "erasure_archive" DROP CONSTRAINT "erasure_archive_scope_check";--> statement-breakpoint
ALTER TABLE "erasure_archive" ADD CONSTRAINT "erasure_archive_scope_check" CHECK ("erasure_archive"."scope" in ('customer','account'));--> statement-breakpoint

-- The trigger body is stored as text, so unlike the policies above it does
-- NOT follow the table rename and must be redefined. This is 0013's body with
-- the new names — NOT 0003's: 0013 replaced the function to also seed the
-- three service presets, and dropping that half would leave every new signup
-- with an empty service list.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.accounts (id, email, timezone, retention_days)
  VALUES (NEW.id, NEW.email, 'Europe/Berlin', 90);

  INSERT INTO public.services (account_id, name, duration_min, active)
  VALUES
    (NEW.id, 'Vlerësim i parë', 45, true),
    (NEW.id, 'Seancë vijuese', 30, true),
    (NEW.id, 'Terapi manuale', 60, false);
  RETURN NEW;
END;
$$;
