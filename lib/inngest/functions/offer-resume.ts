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
  | { offer: false; reason: 'recent_pt_activity'; retryAt: string };

export async function checkResumeOffer(args: {
  ptId: string;
  conversationId: string;
  patientId: string;
  now?: Date;
}): Promise<ResumeOfferDecision> {
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
    .select({ createdAt: messages.createdAt })
    .from(messages)
    .where(
      and(
        eq(messages.ptId, args.ptId),
        eq(messages.conversationId, args.conversationId),
        eq(messages.role, 'pt'),
        gte(messages.createdAt, subHours(now, IDLE_HOURS)),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);
  if (recentPtMessage) {
    return {
      offer: false,
      reason: 'recent_pt_activity',
      retryAt: addHours(recentPtMessage.createdAt, IDLE_HOURS).toISOString(),
    };
  }
  return { offer: true };
}

export const offerResumeAfterPtInactivity = inngest.createFunction(
  {
    id: 'offer-resume-after-pt-inactivity',
    retries: 2,
    // One run per emitted event (both emitters guard on a real aiActive
    // true -> false transition, so that is one run per handoff). Keyed on the
    // event id rather than takenOverAt because `conversation.escalated` has no
    // such field; same pattern as dispatch-push.
    idempotency: 'event.id',
  },
  // An escalation hands the thread to the PT exactly like a manual takeover, so
  // it has to arm the same offer — otherwise the assistant stays off for good the
  // moment a patient asks for a human. Both payloads carry the three ids
  // checkResumeOffer needs.
  [{ event: 'conversation.taken_over' }, { event: 'conversation.escalated' }],
  async ({ event, step }) => {
    await step.sleep('wait-for-pt-inactivity', `${IDLE_HOURS}h`);

    let decision = await step.run('check-pt-inactivity', () =>
      checkResumeOffer(event.data),
    );
    for (
      let rearm = 0;
      !decision.offer &&
      decision.reason === 'recent_pt_activity' &&
      rearm < MAX_REARMS;
      rearm += 1
    ) {
      await step.sleepUntil(`re-arm-${rearm}`, decision.retryAt);
      decision = await step.run(`check-pt-inactivity-${rearm + 1}`, () =>
        checkResumeOffer(event.data),
      );
    }
    if (!decision.offer) return decision;

    await step.sendEvent('emit-resume-offered', {
      name: 'conversation.resume_offered',
      data: {
        ptId: event.data.ptId,
        conversationId: event.data.conversationId,
        patientId: event.data.patientId,
      },
    });
    return decision;
  },
);
