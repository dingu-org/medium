import { and, desc, eq, gte } from 'drizzle-orm';
import { subHours } from 'date-fns';
import { db } from '@/lib/db';
import { conversations, messages } from '@/lib/db/schema';
import { inngest } from '../client';

export async function checkResumeOffer(args: {
  ptId: string;
  conversationId: string;
  patientId: string;
  now?: Date;
}): Promise<
  | { offer: true }
  | { offer: false; reason: 'not_found' | 'ai_active' | 'recent_pt_activity' }
> {
  const now = args.now ?? new Date();
  const [conversation] = await db
    .select({ aiActive: conversations.aiActive })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, args.conversationId),
        eq(conversations.ptId, args.ptId),
        eq(conversations.patientId, args.patientId),
      ),
    )
    .limit(1);
  if (!conversation) return { offer: false, reason: 'not_found' };
  if (conversation.aiActive) return { offer: false, reason: 'ai_active' };

  const [recentPtMessage] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.ptId, args.ptId),
        eq(messages.conversationId, args.conversationId),
        eq(messages.role, 'pt'),
        gte(messages.createdAt, subHours(now, 1)),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);
  if (recentPtMessage) {
    return { offer: false, reason: 'recent_pt_activity' };
  }
  return { offer: true };
}

export const offerResumeAfterPtInactivity = inngest.createFunction(
  {
    id: 'offer-resume-after-pt-inactivity',
    retries: 2,
    idempotency: 'event.data.conversationId + ":" + event.data.takenOverAt',
  },
  { event: 'conversation.taken_over' },
  async ({ event, step }) => {
    await step.sleep('wait-for-pt-inactivity', '1h');
    const result = await step.run('check-pt-inactivity', () =>
      checkResumeOffer(event.data),
    );
    if (!result.offer) return result;

    await step.sendEvent('emit-resume-offered', {
      name: 'conversation.resume_offered',
      data: {
        ptId: event.data.ptId,
        conversationId: event.data.conversationId,
        patientId: event.data.patientId,
      },
    });
    return result;
  },
);
