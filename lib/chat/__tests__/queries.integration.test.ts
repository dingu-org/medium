import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { conversations, messages, patients } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { getUnreadChatCount } from '../queries';
import { getChatThreadSnapshot } from '@/lib/pwa/read-models';

let ptId = '';
let conversationId = '';

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `chat-unread-${Date.now()}@example.com`,
    password: 'chat-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Missing user');
  ptId = data.user.id;
  const [patient] = await db
    .insert(patients)
    .values({ ptId, name: 'Unread Client', phone: '+355690000099' })
    .returning({ id: patients.id });
  const [conversation] = await db
    .insert(conversations)
    .values({ ptId, patientId: patient.id, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  conversationId = conversation.id;
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

describe('chat unread count', () => {
  it('counts patient messages after last_read_at and ignores closed threads', async () => {
    await db.insert(messages).values({
      ptId,
      conversationId,
      role: 'patient',
      channel: 'whatsapp',
      content: 'Përshëndetje',
    });
    await expect(getUnreadChatCount(ptId)).resolves.toBe(1);
    await db
      .update(conversations)
      .set({ lastReadAt: new Date() })
      .where(
        and(eq(conversations.id, conversationId), eq(conversations.ptId, ptId)),
      );
    await expect(getUnreadChatCount(ptId)).resolves.toBe(0);
    await db.insert(messages).values({
      ptId,
      conversationId,
      role: 'patient',
      channel: 'whatsapp',
      content: 'Mesazh i ri',
    });
    await db
      .update(conversations)
      .set({ closedAt: new Date() })
      .where(eq(conversations.id, conversationId));
    await expect(getUnreadChatCount(ptId)).resolves.toBe(0);
  });

  it('returns the latest 50 messages in chronological order', async () => {
    const [patient] = await db
      .insert(patients)
      .values({ ptId, name: 'Long Thread', phone: '+355690000100' })
      .returning({ id: patients.id });
    const [conversation] = await db
      .insert(conversations)
      .values({ ptId, patientId: patient.id, channel: 'whatsapp' })
      .returning({ id: conversations.id });
    const base = Date.now() - 60_000;
    await db.insert(messages).values(
      Array.from({ length: 55 }, (_, index) => ({
        ptId,
        conversationId: conversation.id,
        role: 'patient' as const,
        channel: 'whatsapp',
        content: `message-${index}`,
        createdAt: new Date(base + index * 1000),
      })),
    );

    const snapshot = await getChatThreadSnapshot(ptId, conversation.id);
    expect(snapshot?.initialMessages).toHaveLength(50);
    expect(snapshot?.initialMessages[0]?.content).toBe('message-5');
    expect(snapshot?.initialMessages.at(-1)?.content).toBe('message-54');
  });
});
