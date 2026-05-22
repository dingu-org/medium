DROP INDEX "whatsapp_connections_phone_number_id_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "whatsapp_connections_phone_number_id_uq" ON "whatsapp_connections" USING btree ("phone_number_id");