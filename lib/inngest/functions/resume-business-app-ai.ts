import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema';
import { inngest } from '../client';

export async function resumeBusinessAppAiCore(args: {
  accountId: string;
  conversationId: string;
  customerId: string;
  pausedUntil: string;
}): Promise<
  | { resumed: true; conversationId: string }
  | { resumed: false; reason: 'not_due' | 'superseded' }
> {
  const pausedUntil = new Date(args.pausedUntil);
  if (Number.isNaN(pausedUntil.getTime())) {
    return { resumed: false, reason: 'superseded' };
  }
  if (pausedUntil.getTime() > Date.now()) {
    return { resumed: false, reason: 'not_due' };
  }

  const [updated] = await db
    .update(conversations)
    .set({
      aiActive: true,
      aiPausedUntil: null,
      aiPauseReason: null,
      escalationState: 'idle',
    })
    .where(
      and(
        eq(conversations.id, args.conversationId),
        eq(conversations.accountId, args.accountId),
        eq(conversations.customerId, args.customerId),
        eq(conversations.aiActive, false),
        eq(conversations.aiPauseReason, 'whatsapp_business_app_echo'),
        eq(conversations.aiPausedUntil, pausedUntil),
      ),
    )
    .returning({ id: conversations.id });

  if (!updated) return { resumed: false, reason: 'superseded' };
  return { resumed: true, conversationId: updated.id };
}

export const resumeBusinessAppAi = inngest.createFunction(
  {
    id: 'resume-business-app-ai',
    retries: 2,
    idempotency: 'event.id',
    concurrency: {
      limit: 1,
      key: 'event.data.conversationId',
    },
  },
  { event: 'conversation.ai_paused' },
  async ({ event, step }) => {
    await step.sleepUntil('wait-for-business-app-pause', event.data.pausedUntil);
    return step.run('resume-ai-if-current', () =>
      resumeBusinessAppAiCore(event.data),
    );
  },
);
