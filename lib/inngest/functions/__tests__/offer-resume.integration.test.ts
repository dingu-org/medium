import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, messages, patients } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { checkResumeOffer } from '../offer-resume';

let ptId = '';
let patientId = '';
let conversationId = '';
let sequence = 0;

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000);

async function insertPtMessage(createdAt: Date) {
  await db.insert(messages).values({
    ptId,
    conversationId,
    role: 'pt',
    channel: 'whatsapp',
    content: 'Po e shikoj vetë.',
    createdAt,
  });
}

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `offer-resume-${Date.now()}@example.com`,
    password: 'offer-resume-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
});

beforeEach(async () => {
  await db.delete(patients).where(eq(patients.ptId, ptId));

  const [patient] = await db
    .insert(patients)
    .values({
      ptId,
      name: 'Pat',
      phone: `44770092${++sequence}`,
      waId: `44770092${sequence}`,
    })
    .returning({ id: patients.id });
  patientId = patient.id;

  const [conversation] = await db
    .insert(conversations)
    .values({ ptId, patientId, channel: 'whatsapp', aiActive: false })
    .returning({ id: conversations.id });
  conversationId = conversation.id;
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

describe('checkResumeOffer', () => {
  it('offers to resume when the PT has been silent for over an hour', async () => {
    await insertPtMessage(minutesAgo(90));

    await expect(
      checkResumeOffer({ ptId, conversationId, patientId }),
    ).resolves.toEqual({ offer: true });
  });

  it('re-arms from the last PT message instead of declining for good', async () => {
    const lastMessageAt = minutesAgo(5);
    await insertPtMessage(lastMessageAt);

    const decision = await checkResumeOffer({
      ptId,
      conversationId,
      patientId,
    });

    expect(decision).toMatchObject({
      offer: false,
      reason: 'recent_pt_activity',
    });
    // The retry lands one idle hour after that message, i.e. still in the future.
    const retryAt = new Date(
      (decision as { retryAt: string }).retryAt,
    ).getTime();
    expect(retryAt).toBe(lastMessageAt.getTime() + 60 * 60 * 1000);
    expect(retryAt).toBeGreaterThan(Date.now());
  });

  it('declines while the assistant is still handling the conversation', async () => {
    await db
      .update(conversations)
      .set({ aiActive: true })
      .where(eq(conversations.id, conversationId));

    await expect(
      checkResumeOffer({ ptId, conversationId, patientId }),
    ).resolves.toEqual({ offer: false, reason: 'ai_active' });
  });

  it('declines when the conversation no longer exists', async () => {
    await expect(
      checkResumeOffer({ ptId, conversationId: randomUUID(), patientId }),
    ).resolves.toEqual({ offer: false, reason: 'not_found' });
  });
});
