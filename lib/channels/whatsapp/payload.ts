import { z } from 'zod';

const metadata = z
  .object({
    phone_number_id: z.string().min(1),
    display_phone_number: z.string().optional(),
  })
  .passthrough();

// A caption is text the patient typed, and WhatsApp carries it on the media
// object — never in `text`. Declared so it survives into the persisted
// placeholder instead of being dropped with the body we cannot read. Image,
// video and document are the three Cloud API types that have one.
const captionedMedia = z
  .object({ caption: z.string().optional() })
  .passthrough()
  .optional();

const inboundMessage = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  timestamp: z.string().min(1),
  type: z.string().min(1),
  text: z.object({ body: z.string() }).optional(),
  image: captionedMedia,
  video: captionedMedia,
  document: captionedMedia,
}).passthrough();

/** The caption the patient typed on a media message, if any. */
export function inboundCaption(
  msg: z.infer<typeof inboundMessage>,
): string | null {
  return msg.image?.caption ?? msg.video?.caption ?? msg.document?.caption ?? null;
}

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

// Meta message-status object (delivery truth, Phase 16 C3). `status` is a
// lenient string, NOT an enum: a new Meta status value must not fail the whole
// webhook schema (which would 400 the batch and drop every status in it). The
// handler narrows to sent|delivered|read|failed and ignores the rest. The
// pricing object carries category/type/model + billable (no amount).
export const statusEvent = z
  .object({
    id: z.string().min(1),
    status: z.string().min(1),
    timestamp: z.string().min(1),
    recipient_id: z.string().optional(),
    conversation: z
      .object({
        id: z.string().optional(),
        origin: z
          .object({ type: z.string().optional() })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    pricing: z
      .object({
        billable: z.boolean().optional(),
        pricing_model: z.string().optional(),
        category: z.string().optional(),
        type: z.string().optional(),
      })
      .passthrough()
      .optional(),
    errors: z.array(webhookError).optional(),
  })
  .passthrough();

export type WhatsappStatusEvent = z.infer<typeof statusEvent>;

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
      statuses: z.array(statusEvent).optional(),
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
