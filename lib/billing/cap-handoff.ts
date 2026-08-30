/**
 * Cap hard-stop handoff (Phase 16 C2, extended 2026-08-14). When a PT's monthly
 * conversation cap is reached, a new customer-day is answered once — with the
 * shared escalation sentence telling the customer a person will reply — instead
 * of an AI turn. The PT's inbox and manual chat are never blocked; only the
 * automated AI reply is.
 *
 * Since 2026-08-14 the PT is also *told*: a `conversation.needs_reply` push says
 * a customer is waiting. Before that the customer got a holding message and the
 * PT got nothing.
 *
 * `deterministic-cap-handoff` joins the existing deterministic model markers
 * (`deterministic-reminder-response`, `deterministic-failure-handoff`); C4 will
 * centralize that allowlist for cost queries. This message carries no
 * plan/limit/AI language — that lives on the PT-facing surfaces (push, bell,
 * chat banner), not in the customer's chat.
 *
 * Since 2026-08-30 the words themselves are the shared `escalationMessage`, the
 * same sentence a model escalation, an accepted offer and a crashed turn send.
 * The customer must never be able to tell which of the four happened: "we are
 * out of conversations this month" is true, useless to them, and damaging to
 * the business. What is useful is identical in all four cases — a person has
 * this now — so it is one sentence in one place.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations } from '@/lib/db/schema';
import {
  businessLabel,
  escalationMessage,
} from '@/lib/conversation/customer-copy';
import { persistDeterministicReply } from '@/lib/conversation/deterministic-reply';
import type { InboundMessage, OutboundMessage } from '@/lib/conversation/types';
import {
  dispatchPushForEvent,
  type DispatchResult,
} from '@/lib/notifications/push-dispatch';
import { conversationDayKeys } from './usage';

export const CAP_HANDOFF_MODEL = 'deterministic-cap-handoff';

/**
 * Decide whether to send the handoff for this inbound. Only one handoff is sent
 * per conversation per local day (guarded by `conversations.limit_handoff_at`),
 * so a customer sending several messages after hitting the cap gets exactly one
 * reply that day. The per-inbound AI-reply unique index makes the persist
 * itself idempotent under Inngest retries.
 *
 * `name` is the account's own name, threaded in from the inbound job context
 * that already carries it, so this sentence reads exactly like the escalation a
 * customer would get from any other path — including the fallback to the
 * vertical-neutral label when the business never filled a name in.
 */
export async function prepareCapHandoff(args: {
  inbound: InboundMessage;
  name: string | null;
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
        eq(conversations.accountId, args.inbound.accountId),
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
    content: escalationMessage(businessLabel(args.name)),
    model: CAP_HANDOFF_MODEL,
  });
  return { action: 'send', outbound };
}

/** Record that today's handoff was sent so the same day won't send another. */
export async function markCapHandoff(args: {
  accountId: string;
  conversationId: string;
  instant: Date;
}): Promise<void> {
  await db
    .update(conversations)
    .set({ limitHandoffAt: args.instant })
    .where(
      and(
        eq(conversations.id, args.conversationId),
        eq(conversations.accountId, args.accountId),
      ),
    );
}

/**
 * Tell the PT a capped customer is waiting. Notify only — the conversation is
 * left exactly as it was.
 *
 * This used to also write `ai_active = false, escalation_state = 'requested'`,
 * hand-rolling the transition that `escalateConversationToHuman` owns. Two
 * things were wrong with that. The state is *permanent* and only a human undoes
 * it (the PT toggling the thread back from the chat screen), while the reason
 * for it is *transient*: the cap clears at month rollover or the moment the PT
 * upgrades. A billing condition should never need a human rescue to unwind. And
 * a conversation-level escalation is not a billing fact to begin with — a
 * customer at the cap asked for nothing, so nothing about the thread changed.
 *
 * With nothing written, resuming needs no code: once the cap clears, the next
 * inbound finds `ai_active` still true and takes an ordinary AI turn.
 *
 * The 2nd..Nth message of a capped day still reaches the PT, by a different
 * route than before. The cap gate compensates its day-fact away when it turns a
 * customer away, so every later message that day hits the cap afresh and lands
 * here again — ahead of the once-a-day `prepareCapHandoff` throttle that keeps
 * the *customer* from being told twice. The push tag is per-conversation, so a
 * burst collapses into one notification on the device.
 *
 * The push is deliberately `conversation.needs_reply` ("new message") and not
 * `conversation.escalated` ("X asked to talk to you"): at the cap the customer
 * asked for nothing. Push yes, bell no — the value of a "reply now" nudge decays
 * in hours, and the durable records are the unread badge and the monthly
 * `billing.limit_reached` event, which both already reach the PT.
 */
export async function notifyCappedConversation(args: {
  accountId: string;
  conversationId: string;
  customerId: string;
  traceId?: string;
}): Promise<DispatchResult> {
  return await dispatchPushForEvent({
    name: 'conversation.needs_reply',
    data: {
      accountId: args.accountId,
      conversationId: args.conversationId,
      customerId: args.customerId,
      traceId: args.traceId,
    },
  });
}
