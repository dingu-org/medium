import { z } from 'zod';

const metadata = z
  .object({
    phone_number_id: z.string().min(1),
    display_phone_number: z.string().optional(),
  })
  .passthrough();

const inboundMessage = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  timestamp: z.string().min(1),
  type: z.string().min(1),
  text: z.object({ body: z.string() }).optional(),
}).passthrough();

const messageEcho = z
  .object({
    id: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
    timestamp: z.string().min(1),
    type: z.string().min(1),
    text: z.object({ body: z.string() }).optional(),
  })
  .passthrough();

const contact = z.object({
  wa_id: z.string().min(1),
  profile: z.object({ name: z.string().optional() }).optional(),
});

const webhookError = z
  .object({
    code: z.number().int().optional(),
    title: z.string().optional(),
    message: z.string().optional(),
    error_data: z
      .object({ details: z.string().optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

const historyItem = z
  .object({
    metadata: z
      .object({
        phase: z.union([z.number(), z.string()]).optional(),
        chunk_order: z.union([z.number(), z.string()]).optional(),
        progress: z.union([z.number(), z.string()]).optional(),
      })
      .passthrough()
      .optional(),
    threads: z.array(z.unknown()).optional(),
    errors: z.array(webhookError).optional(),
  })
  .passthrough();

const appStateSyncItem = z
  .object({
    type: z.string().optional(),
    action: z.string().optional(),
    contact: z
      .object({
        full_name: z.string().optional(),
        first_name: z.string().optional(),
        phone_number: z.string().optional(),
        wa_id: z.string().optional(),
      })
      .passthrough()
      .optional(),
    metadata: z
      .object({
        timestamp: z.union([z.string(), z.number()]).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const change = z.object({
  field: z.string(),
  value: z
    .object({
      messaging_product: z.string().optional(),
      metadata: metadata.optional(),
      contacts: z.array(contact).optional(),
      messages: z.array(inboundMessage).optional(),
      statuses: z.array(z.unknown()).optional(),
      errors: z.array(webhookError).optional(),
      history: z.array(historyItem).optional(),
      state_sync: z.array(appStateSyncItem).optional(),
      message_echoes: z.array(messageEcho).optional(),
      phone_number: z.string().optional(),
      event: z.string().optional(),
      disconnection_info: z.record(z.string(), z.unknown()).optional(),
    })
    .passthrough(),
});

export const whatsappWebhookPayload = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(z.object({ id: z.string(), changes: z.array(change) })),
});

export type WhatsappWebhookPayload = z.infer<typeof whatsappWebhookPayload>;
export type WhatsappChange = z.infer<typeof change>;
export type WhatsappChangeValue = z.infer<typeof change>['value'];
