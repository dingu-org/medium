import { describe, it, expect } from 'vitest';
import { whatsappWebhookPayload } from '../payload';

const validTextPayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA_ID',
      changes: [
        {
          field: 'messages',
          value: {
            metadata: {
              display_phone_number: '15551234567',
              phone_number_id: 'PNI_123',
            },
            contacts: [{ wa_id: '447700900000', profile: { name: 'Jane' } }],
            messages: [
              {
                from: '447700900000',
                id: 'wamid.HBgL...',
                timestamp: '1700000000',
                type: 'text',
                text: { body: 'Hello' },
              },
            ],
          },
        },
      ],
    },
  ],
};

describe('whatsappWebhookPayload', () => {
  it('parses a typical Meta text-message payload', () => {
    const result = whatsappWebhookPayload.safeParse(validTextPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.entry[0].changes[0].value.messages?.[0].id).toBe('wamid.HBgL...');
    }
  });

  it('rejects a payload missing the entry array', () => {
    const result = whatsappWebhookPayload.safeParse({ object: 'whatsapp_business_account' });
    expect(result.success).toBe(false);
  });

  it('rejects a payload with the wrong object value', () => {
    const result = whatsappWebhookPayload.safeParse({
      ...validTextPayload,
      object: 'page',
    });
    expect(result.success).toBe(false);
  });
});
