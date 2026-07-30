-- WHY: `conversation_days` is the ONLY store of metered Free-plan conversation
-- usage — lib/billing/usage.ts derives `used` by counting rows per (pt_id,
-- month_key) on every turn, both for the cap gate and the /settings/billing
-- meter. But `patient_id` and `conversation_id` were `NOT NULL ... ON DELETE
-- cascade` (0020), so GDPR per-patient erasure (lib/patients/erase.ts) and any
-- future retention purge of a conversation silently DELETE the billing facts
-- with the personal data: the month's count drops, a PT can reclaim free quota
-- by erasing chatty clients, and the billing history is lost retroactively.
--
-- The metered fact only needs pt_id + local_day + month_key. So both patient
-- references become nullable with ON DELETE SET NULL: erasing the patient (or
-- purging the conversation) strips the last personal-data link while the counted
-- day survives, matching this table's stated intent that `first_message_id` is a
-- bare uuid because "the message may be retention-erased while the billing fact
-- must survive". The counting query filters on pt_id + month_key only and joins
-- nothing, so NULL rows keep counting; the `(pt_id, patient_id, local_day)`
-- unique index still dedupes live patient-days (inserts always supply a real
-- patient_id) and simply stops constraining anonymised historical rows, which is
-- correct — two erased patients may legitimately share a local_day.
ALTER TABLE "conversation_days" ALTER COLUMN "patient_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "conversation_days" ALTER COLUMN "conversation_id" DROP NOT NULL;--> statement-breakpoint

ALTER TABLE "conversation_days" DROP CONSTRAINT "conversation_days_patient_id_patients_id_fk";--> statement-breakpoint
ALTER TABLE "conversation_days" ADD CONSTRAINT "conversation_days_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "conversation_days" DROP CONSTRAINT "conversation_days_conversation_id_conversations_id_fk";--> statement-breakpoint
ALTER TABLE "conversation_days" ADD CONSTRAINT "conversation_days_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;
