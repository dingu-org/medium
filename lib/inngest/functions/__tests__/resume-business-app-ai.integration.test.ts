import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, customers } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { resumeBusinessAppAiCore } from '../resume-business-app-ai';

let accountId = '';
let customerId = '';
let conversationId = '';
let sequence = 0;

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `resume-ai-${Date.now()}@example.com`,
    password: 'resume-ai-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  accountId = data.user.id;
});

beforeEach(async () => {
  await db.delete(customers).where(eq(customers.accountId, accountId));

  const [customer] = await db
    .insert(customers)
    .values({
      accountId,
      name: 'Pat',
      phone: `44770091${++sequence}`,
      waId: `44770091${sequence}`,
    })
    .returning({ id: customers.id });
  customerId = customer.id;

  const [conversation] = await db
    .insert(conversations)
    .values({
      accountId,
      customerId,
      channel: 'whatsapp',
      aiActive: false,
      aiPausedUntil: new Date(Date.now() - 60_000),
      aiPauseReason: 'whatsapp_business_app_echo',
      escalationState: 'idle',
    })
    .returning({ id: conversations.id });
  conversationId = conversation.id;
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

describe('resumeBusinessAppAiCore', () => {
  it('resumes AI when the exact Business app pause has expired', async () => {
    const [before] = await db
      .select({ pausedUntil: conversations.aiPausedUntil })
      .from(conversations)
      .where(eq(conversations.id, conversationId));

    await expect(
      resumeBusinessAppAiCore({
        accountId,
        customerId,
        conversationId,
        pausedUntil: before.pausedUntil!.toISOString(),
      }),
    ).resolves.toEqual({ resumed: true, conversationId });

    const [after] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    expect(after.aiActive).toBe(true);
    expect(after.aiPausedUntil).toBeNull();
    expect(after.aiPauseReason).toBeNull();
  });

  it('does not resume before the pause expires', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    await db
      .update(conversations)
      .set({ aiPausedUntil: future })
      .where(eq(conversations.id, conversationId));

    await expect(
      resumeBusinessAppAiCore({
        accountId,
        customerId,
        conversationId,
        pausedUntil: future.toISOString(),
      }),
    ).resolves.toEqual({ resumed: false, reason: 'not_due' });

    const [after] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    expect(after.aiActive).toBe(false);
    expect(after.aiPauseReason).toBe('whatsapp_business_app_echo');
  });

  it('does not resume when a manual takeover superseded the app pause', async () => {
    const [before] = await db
      .select({ pausedUntil: conversations.aiPausedUntil })
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    await db
      .update(conversations)
      .set({ aiPauseReason: null, aiPausedUntil: null })
      .where(eq(conversations.id, conversationId));

    await expect(
      resumeBusinessAppAiCore({
        accountId,
        customerId,
        conversationId,
        pausedUntil: before.pausedUntil!.toISOString(),
      }),
    ).resolves.toEqual({ resumed: false, reason: 'superseded' });

    const [after] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId));
    expect(after.aiActive).toBe(false);
  });
});
