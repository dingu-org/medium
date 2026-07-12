ALTER TABLE "pts" ADD COLUMN "full_name" text;--> statement-breakpoint
ALTER TABLE "pts" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "pts" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "pts" ADD COLUMN "assistant_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "services" ADD COLUMN "price_lek" integer;--> statement-breakpoint
ALTER TABLE "whatsapp_connections" ADD COLUMN "display_phone_number" text;--> statement-breakpoint
ALTER TABLE "services" ADD CONSTRAINT "services_price_positive" CHECK ("services"."price_lek" > 0);