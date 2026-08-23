/**
 * Cap hard-stop handoff (Phase 16 C2, extended 2026-08-14). When a PT's monthly
 * conversation cap is reached, a new patient-day is answered once — with a
 * single warm, static message telling the patient a person will reply — instead
 * of an AI turn. The PT's inbox and manual chat are never blocked; only the
 * automated AI reply is.
 *
 * Since 2026-08-14 the PT is also *told*. At the cap the assistant genuinely
 * cannot serve this patient, so unlike an out-of-scope question there is nothing
 * to offer and nothing to ask: the conversation is handed to the PT the way any
 * escalation is, and a `conversation.needs_reply` push says a patient is
 * waiting. Before that the patient got a holding message, the PT got nothing,
 * and the thread still looked AI-handled in the inbox.
 *
 * `deterministic-cap-handoff` joins the existing deterministic model markers
 * (`deterministic-reminder-response`, `deterministic-failure-handoff`); C4 will
 * centralize that allowlist for cost queries. This message carries no
 * plan/limit/AI language — that lives on the PT-facing surfaces (push, bell,
 * chat banner), not in the patient's chat.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema';
import { persistDeterministicReply } from '@/lib/conversation/deterministic-reply';
import type { InboundMessage, OutboundMessage } from '@/lib/conversation/types';
import {
  dispatchPushForEvent,
  type DispatchResult,
} from '@/lib/notifications/push-dispatch';
import { conversationDayKeys } from './usage';

export const CAP_HANDOFF_MODEL = 'deterministic-cap-handoff';

/** One static, patient-facing Albanian handoff. Reviewable in one place. */
export const CAP_HANDOFF_MESSAGE_SQ =
  'Faleminderit për mesazhin! Do t’ju përgjigjemi personalisht sa më shpejt.';

/**
 * Decide whether to send the handoff for this inbound. Only one handoff is sent
 * per conversation per local day (guarded by `conversations.limit_handoff_at`),
 * so a patient sending several messages after hitting the cap gets exactly one
 * reply that day. The per-inbound AI-reply unique index makes the persist
 * itself idempotent under Inngest retries.
 */
export async function prepareCapHandoff(args: {
  inbound: InboundMessage;
  timezone: string;
  instant: Date;
}): Promise<
  | { action: 'send'; outbound: OutboundMessage }
  | { action: 'skip'; reason: 'already_handed_off_today' }
> {
  const { localDay } = conversationDayKeys(args.instant, args.timezone);

  const [conversation] = await db
    .select({ limitHandoffAt: conversations.limitHandoffAt })
    .from(conversations)
    .where(
      and(
        eq(conversations.id, args.inbound.conversationId),
        eq(conversations.ptId, args.inbound.ptId),
      ),
    )
    .limit(1);

  if (conversation?.limitHandoffAt) {
    const handoffDay = conversationDayKeys(
      conversation.limitHandoffAt,
      args.timezone,
    ).localDay;
    if (handoffDay === localDay) {
      return { action: 'skip', reason: 'already_handed_off_today' };
    }
  }

  const outbound = await persistDeterministicReply({
    inbound: args.inbound,
    content: CAP_HANDOFF_MESSAGE_SQ,
    model: CAP_HANDOFF_MODEL,
  });
  return { action: 'send', outbound };
}

/** Record that today's handoff was sent so the same day won't send another. */
export async function markCapHandoff(args: {
  ptId: string;
  conversationId: string;
  instant: Date;
}): Promise<void> {
  await db
    .update(conversations)
    .set({ limitHandoffAt: args.instant })
    .where(
      and(
        eq(conversations.id, args.conversationId),
        eq(conversations.ptId, args.ptId),
      ),
    );
}

/**
 * Hand a capped conversation to the PT and tell them a patient is waiting.
 *
 * The flag is the same one every human handoff sets (`ai_active = false`,
 * `escalation_state = 'requested'`) rather than a cap-specific state: the thread
 * is human-owned in exactly the sense the inbox, the chat banner and the Today
 * list already understand, and inventing a third value that all three would
 * treat identically buys nothing. The transition guard on `ai_active` makes a
 * repeat a no-op.
 *
 * That flag is also what keeps the 2nd..Nth message of a capped day from
 * vanishing. The cap gate compensates its day-fact away when it turns a patient
 * away, so every later message that day hits the cap afresh and the once-a-day
 * handoff throttle returns `skip` — which used to mean silence for everyone.
 * With the conversation human-owned, those messages take the manual-handling
 * path in `handle-inbound-message` instead, which pushes the same
 * `conversation.needs_reply` nudge. The push tag is per-conversation, so a burst
 * collapses into one notification on the device.
 *
 * The push is deliberately `conversation.needs_reply` ("new message") and not
 * `conversation.escalated` ("X asked to talk to you"): at the cap the patient
 * asked for nothing. It does mean no resume offer is armed for this thread —
 * that is the honest outcome, since while the PT is at their cap the assistant
 * would only hit it again on the next message; the PT hands the thread back to
 * the assistant from the chat screen, which clears the flag as it does for any
 * escalation.
 */
export async function handOffCappedConversation(args: {
  ptId: string;
  conversationId: string;
  patientId: string;
  traceId?: string;
}): Promise<{ flagged: boolean; push: DispatchResult }> {
  const [updated] = await db
    .update(conversations)
    .set({ aiActive: false, escalationState: 'requested' })
    .where(
      and(
        eq(conversations.id, args.conversationId),
        eq(conversations.ptId, args.ptId),
        eq(conversations.aiActive, true),
      ),
    )
    .returning({ id: conversations.id });

  const push = await dispatchPushForEvent({
    name: 'conversation.needs_reply',
    data: {
      ptId: args.ptId,
      conversationId: args.conversationId,
      patientId: args.patientId,
      traceId: args.traceId,
    },
  });

  return { flagged: Boolean(updated), push };
}
