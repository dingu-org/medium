import { and, desc, eq, gte } from 'drizzle-orm';
import { addHours, subHours } from 'date-fns';
import { db } from '@/lib/db';
import { conversations, messages } from '@/lib/db/schema';
import { inngest } from '../client';

// The offer fires once the PT has been silent for this long, and is re-armed from
// their last message instead of declining for good — a PT who answers by hand at
// minute 5 of the wait would otherwise never be asked to resume. Bounded so a
// thread the PT keeps handling manually doesn't hold a run open forever.
const IDLE_HOURS = 1;
const MAX_REARMS = 12;

type ResumeOfferDecision =
  | { offer: true }
  | { offer: false; reason: 'not_found' | 'ai_active' }
  | { offer: false; reason: 'recent_account_activity'; retryAt: string };

export async function checkResumeOffer(args: {
  accountId: string;
  conversationId: string;
  customerId: string;
  now?: Date;
}): Promise<ResumeOfferDecision> {
  const now = args.now ?? new Date();
  const [conversation] = await db
    .select({ aiActive: conversations.aiActive })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, args.conversationId),
        eq(conversations.accountId, args.accountId),
        eq(conversations.customerId, args.customerId),
      ),
    )
    .limit(1);
  if (!conversation) return { offer: false, reason: 'not_found' };
  if (conversation.aiActive) return { offer: false, reason: 'ai_active' };

  const [recentAccountMessage] = await db
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(
      and(
        eq(messages.accountId, args.accountId),
        eq(messages.conversationId, args.conversationId),
        eq(messages.role, 'account'),
        gte(messages.createdAt, subHours(now, IDLE_HOURS)),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);
  if (recentAccountMessage) {
    return {
      offer: false,
      reason: 'recent_account_activity',
      retryAt: addHours(recentAccountMessage.createdAt, IDLE_HOURS).toISOString(),
    };
  }
  return { offer: true };
}

export const offerResumeAfterAccountInactivity = inngest.createFunction(
  {
    id: 'offer-resume-after-account-inactivity',
    retries: 2,
    // One run per emitted event (both emitters guard on a real aiActive
    // true -> false transition, so that is one run per handoff). Keyed on the
    // event id rather than takenOverAt because `conversation.escalated` has no
    // such field; same pattern as dispatch-push.
    idempotency: 'event.id',
  },
  // An escalation hands the thread to the PT exactly like a manual takeover, so
  // it has to arm the same offer — otherwise the assistant stays off for good the
  // moment a customer asks for a human. Both payloads carry the three ids
  // checkResumeOffer needs.
  [{ event: 'conversation.taken_over' }, { event: 'conversation.escalated' }],
  async ({ event, step }) => {
    await step.sleep('wait-for-account-inactivity', `${IDLE_HOURS}h`);

    let decision = await step.run('check-account-inactivity', () =>
      checkResumeOffer(event.data),
    );
    for (
      let rearm = 0;
      !decision.offer &&
      decision.reason === 'recent_account_activity' &&
      rearm < MAX_REARMS;
      rearm += 1
    ) {
      await step.sleepUntil(`re-arm-${rearm}`, decision.retryAt);
      decision = await step.run(`check-account-inactivity-${rearm + 1}`, () =>
        checkResumeOffer(event.data),
      );
    }
    if (!decision.offer) return decision;

    await step.sendEvent('emit-resume-offered', {
      name: 'conversation.resume_offered',
      data: {
        accountId: event.data.accountId,
        conversationId: event.data.conversationId,
        customerId: event.data.customerId,
      },
    });
    return decision;
  },
);
