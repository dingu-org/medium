-- Services step (MED-118). Each service gets one mode (where it takes place) and
-- a description the assistant can use. Both nullable: every existing service has
-- neither and stays valid; "required" is enforced by the onboarding form.
-- Additive only: no backfill, no default, no rewrite.
CREATE TYPE "public"."service_mode" AS ENUM('at_business', 'at_client', 'online');--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "mode" "service_mode";