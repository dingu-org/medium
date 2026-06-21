import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, patients } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { resumeBusinessAppAiCore } from '../resume-business-app-ai';

let ptId = '';
let patientId = '';
let conversationId = '';
let sequence = 0;

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `resume-ai-${Date.now()}@example.com`,
    password: 'resume-ai-pass-1234',
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
      phone: `44770091${++sequence}`,
      waId: `44770091${sequence}`,
    })
    .returning({ id: patients.id });
  patientId = patient.id;

  const [conversation] = await db
    .insert(conversations)
    .values({
      ptId,
      patientId,
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
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

describe('resumeBusinessAppAiCore', () => {
  it('resumes AI when the exact Business app pause has expired', async () => {
    const [before] = await db
      .select({ pausedUntil: conversations.aiPausedUntil })
      .from(conversations)
      .where(eq(conversations.id, conversationId));

    await expect(
      resumeBusinessAppAiCore({
        ptId,
        patientId,
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
        ptId,
        patientId,
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
        ptId,
        patientId,
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
