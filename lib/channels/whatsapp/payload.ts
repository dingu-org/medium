import { z } from 'zod';

const inboundMessage = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  timestamp: z.string().min(1),
  type: z.string().min(1),
  text: z.object({ body: z.string() }).optional(),
});

const contact = z.object({
  wa_id: z.string().min(1),
  profile: z.object({ name: z.string().optional() }).optional(),
});

const change = z.object({
  field: z.string(),
  value: z.object({
    metadata: z.object({
      phone_number_id: z.string().min(1),
      display_phone_number: z.string().optional(),
    }),
    contacts: z.array(contact).optional(),
    messages: z.array(inboundMessage).optional(),
    statuses: z.array(z.unknown()).optional(),
  }),
});

export const whatsappWebhookPayload = z.object({
  object: z.literal('whatsapp_business_account'),
  entry: z.array(z.object({ id: z.string(), changes: z.array(change) })),
});

export type WhatsappWebhookPayload = z.infer<typeof whatsappWebhookPayload>;
export type WhatsappChangeValue = z.infer<typeof change>['value'];
