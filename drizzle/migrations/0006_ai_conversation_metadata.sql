ALTER TABLE "messages" ADD COLUMN "reply_to_message_id" uuid;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "ai_cost_microusd" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_reply_to_message_id_messages_id_fk" FOREIGN KEY ("reply_to_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "messages_ai_reply_to_uq" ON "messages" USING btree ("reply_to_message_id") WHERE role = 'ai' AND reply_to_message_id IS NOT NULL;