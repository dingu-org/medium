-- WHY: the monthly reminder quota (lib/billing/usage.ts) counted
-- `reminder_jobs.delivered_at`, and that row is unique per appointment. Two
-- separate problems fell out of one column:
--
-- 1. GDPR erasure destroyed the meter. `appointments.patient_id` cascades from
--    `patients` and `reminder_jobs.appointment_id` cascades from `appointments`,
--    so erasePatient hard-deleted every delivered reminder the patient ever
--    received. A Free PT at the 10/month cap could erase one client who got 5
--    reminders and immediately send 5 more — verbatim the "reclaim free quota by
--    erasing chatty clients" that 0025 fixed for `conversation_days`, one table
--    over.
-- 2. A reschedule re-arms the same job row onto a SECOND template that Meta
--    bills separately, but `delivered_at` is one scalar, so the month counted at
--    most one delivery per appointment however many templates were paid for.
--
-- Both are the same shape: the billed fact lived on a row that belongs to the
-- appointment (and therefore to the patient) instead of to the delivery. So the
-- fact moves to its own table, one row per Meta-confirmed wamid, holding nothing
-- but pt_id + delivered_at. `appointment_id` is nullable ON DELETE SET NULL for
-- the same reason `conversation_days.patient_id` is: the metered fact must
-- outlive the personal data it happens to describe. The unique index on
-- `external_id` keeps a redelivered `delivered` webhook from counting twice.
--
-- A wamid embeds the recipient's phone number, so it is NOT anonymous and cannot
-- simply be left behind: erasePatient rewrites `external_id` to
-- `erased:<row id>`, which keeps the row unique and countable while destroying
-- the identifier. `reminder_jobs.delivered_at` stays as the latest-cycle
-- convenience the appointment badge reads; it is no longer a billing input.
CREATE TABLE "reminder_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pt_id" uuid NOT NULL,
	"appointment_id" uuid,
	"external_id" text NOT NULL,
	"delivered_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_pt_id_pts_id_fk" FOREIGN KEY ("pt_id") REFERENCES "public"."pts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ADD CONSTRAINT "reminder_deliveries_appointment_id_appointments_id_fk" FOREIGN KEY ("appointment_id") REFERENCES "public"."appointments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_deliveries_external_id_uq" ON "reminder_deliveries" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "reminder_deliveries_pt_delivered_idx" ON "reminder_deliveries" USING btree ("pt_id","delivered_at");--> statement-breakpoint

-- Deny-all RLS: metering truth is operator data, not PT-facing, and it is
-- written only by the statuses webhook through the RLS-bypassing owner
-- connection. Mirrors erasure_archive (0016) / wa_message_statuses (0021).
-- drizzle-kit emits neither RLS nor grants; this block is hand-appended per repo
-- convention. The GRANT is SELECT-only for anon/authenticated — 0024's
-- convention: enough to turn a denied read into zero rows instead of a 42501,
-- and nothing more. NOT the `GRANT ALL` of 0012/0013/0021/0022, which is what
-- 0024 had to revoke schema-wide.
GRANT ALL ON TABLE "reminder_deliveries" TO postgres, service_role;--> statement-breakpoint
GRANT SELECT ON TABLE "reminder_deliveries" TO anon, authenticated;--> statement-breakpoint
ALTER TABLE "reminder_deliveries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "reminder_deliveries_tenant_isolation" ON "reminder_deliveries"
	FOR SELECT TO authenticated
	USING (false);
