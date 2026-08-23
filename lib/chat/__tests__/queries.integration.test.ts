import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { conversations, messages, customers } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { getUnreadChatCount } from '../queries';
import { getChatThreadSnapshot } from '@/lib/pwa/read-models';

let accountId = '';
let conversationId = '';

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `chat-unread-${Date.now()}@example.com`,
    password: 'chat-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Missing user');
  accountId = data.user.id;
  const [customer] = await db
    .insert(customers)
    .values({ accountId, name: 'Unread Client', phone: '+355690000099' })
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

describe('chat unread count', () => {
  it('counts customer messages after last_read_at and ignores closed threads', async () => {
    await db.insert(messages).values({
      accountId,
      conversationId,
      role: 'customer',
      channel: 'whatsapp',
      content: 'Përshëndetje',
    });
    await expect(getUnreadChatCount(accountId)).resolves.toBe(1);
    // `messages.created_at` defaults to the DATABASE clock, so stamping
    // last_read_at from the Node clock compares two clocks: a sub-millisecond
    // skew between them leaves the message looking newer than the read marker
    // and the count flakes to 1. Read the marker from the same clock.
    await db
      .update(conversations)
      .set({ lastReadAt: sql`now()` })
      .where(
        and(eq(conversations.id, conversationId), eq(conversations.accountId, accountId)),
      );
    await expect(getUnreadChatCount(accountId)).resolves.toBe(0);
    await db.insert(messages).values({
      accountId,
      conversationId,
      role: 'customer',
      channel: 'whatsapp',
      content: 'Mesazh i ri',
    });
    await db
      .update(conversations)
      .set({ closedAt: new Date() })
      .where(eq(conversations.id, conversationId));
    await expect(getUnreadChatCount(accountId)).resolves.toBe(0);
  });

  it('returns the latest 50 messages in chronological order', async () => {
    const [customer] = await db
      .insert(customers)
      .values({ accountId, name: 'Long Thread', phone: '+355690000100' })
      .returning({ id: customers.id });
    const [conversation] = await db
      .insert(conversations)
      .values({ accountId, customerId: customer.id, channel: 'whatsapp' })
      .returning({ id: conversations.id });
    const base = Date.now() - 60_000;
    await db.insert(messages).values(
      Array.from({ length: 55 }, (_, index) => ({
        accountId,
        conversationId: conversation.id,
        role: 'customer' as const,
        channel: 'whatsapp',
        content: `message-${index}`,
        createdAt: new Date(base + index * 1000),
      })),
    );

    const snapshot = await getChatThreadSnapshot(accountId, conversation.id);
    expect(snapshot?.initialMessages).toHaveLength(50);
    expect(snapshot?.initialMessages[0]?.content).toBe('message-5');
    expect(snapshot?.initialMessages.at(-1)?.content).toBe('message-54');
  });
});
