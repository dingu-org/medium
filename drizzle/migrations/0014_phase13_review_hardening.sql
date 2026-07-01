ALTER TABLE "pts" ADD COLUMN "services_configured_at" timestamp with time zone;--> statement-breakpoint
UPDATE "pts" SET "services_configured_at" = now();
