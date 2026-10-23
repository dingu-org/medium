-- Business identity step (MED-117). Closed list of business types; nullable so
-- every existing account has no type and keeps the general assistant
-- configuration. tagline is the optional short description from the same step.
-- Additive only: no backfill, no default, no rewrite.
CREATE TYPE "public"."business_type" AS ENUM('psychologist', 'physiotherapist', 'dentist', 'beauty_salon', 'personal_trainer', 'barber_hairdresser', 'massage_therapist', 'nutritionist', 'coach_tutor', 'consultant', 'other_professional');--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "business_type" "business_type";--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "tagline" text;