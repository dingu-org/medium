import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  conversations,
  messages,
  customers,
  waMessageStatuses,
} from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { getChatThreadSnapshot } from '../read-models';

let accountId = '';
let conversationId = '';

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `chat-delivery-${Date.now()}@example.com`,
    password: 'chat-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Missing user');
  accountId = data.user.id;
  const [customer] = await db
    .insert(customers)
    .values({ accountId, name: 'Delivery Client', phone: '+355690000200' })
    .returning({ id: customers.id });
  const [conversation] = await db
    .insert(conversations)
    .values({ accountId, customerId: customer.id, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  conversationId = conversation.id;
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

describe('getChatThreadSnapshot · delivery status', () => {
  it('joins wa_message_statuses for outbound messages and is null otherwise', async () => {
    const base = Date.now() - 60_000;

    // Inbound customer message — never carries a delivery status.
    await db.insert(messages).values({
      accountId,
      conversationId,
      role: 'customer',
      channel: 'whatsapp',
      content: 'Përshëndetje',
      externalId: 'wamid.in.1',
      createdAt: new Date(base),
    });
    // Outbound PT message WITH a reported Meta status.
    await db.insert(messages).values({
      accountId,
      conversationId,
      role: 'account',
      channel: 'whatsapp',
      content: 'Faleminderit',
      externalId: 'wamid.out.delivered',
      createdAt: new Date(base + 1000),
    });
    await db.insert(waMessageStatuses).values({
      accountId,
      externalId: 'wamid.out.delivered',
      lastStatus: 'delivered',
      deliveredAt: new Date(),
    });
    // Outbound AI message with NO status row yet.
    await db.insert(messages).values({
      accountId,
      conversationId,
      role: 'ai',
      channel: 'whatsapp',
      content: 'Si mund t’ju ndihmoj?',
      externalId: 'wamid.out.pending',
      createdAt: new Date(base + 2000),
    });

    const snap = await getChatThreadSnapshot(accountId, conversationId);
    const byContent = Object.fromEntries(
      (snap?.initialMessages ?? []).map((m) => [m.content, m]),
    );

    expect(byContent['Përshëndetje']?.deliveryStatus).toBeNull();
    expect(byContent['Faleminderit']?.deliveryStatus).toBe('delivered');
    expect(byContent['Si mund t’ju ndihmoj?']?.deliveryStatus).toBeNull();
  });
});
