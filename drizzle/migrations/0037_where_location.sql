-- Where step (MED-119). Business-level location derived from the services'
-- modes: country (fixed 'AL' for now), city, the optional details and a written
-- service area. The existing accounts.address column is reused. All nullable:
-- every existing account has none and stays valid; "required" is enforced by
-- the onboarding form for the modes in use. Additive only: no backfill, no
-- default, no rewrite.
ALTER TABLE "accounts" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "city" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "directions" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "parking" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "entrance" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "floor" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "service_area" text;