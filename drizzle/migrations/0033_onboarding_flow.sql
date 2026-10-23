-- Guided onboarding (MED-115). Every account that exists now keeps the legacy
-- checklist: the column is added with DEFAULT 'legacy' (which fills existing
-- rows), then the default flips to 'guided' for rows the signup trigger inserts
-- from now on. Both statements run in the migrator's single transaction under
-- ACCESS EXCLUSIVE, so no signup can land between them. handle_new_user()
-- inserts explicit columns only, so it needs no change.
CREATE TYPE "public"."onboarding_flow" AS ENUM('legacy', 'guided');--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "onboarding_flow" "onboarding_flow" DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "onboarding_flow" SET DEFAULT 'guided';--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "onboarding_intro_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "onboarding_whatsapp_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "onboarding_notifications_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "onboarding_completed_at" timestamp with time zone;
