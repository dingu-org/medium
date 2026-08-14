/**
 * Cap hard-stop handoff (Phase 16 C2). When a PT's monthly conversation cap is
 * reached, a new patient-day is answered once — with a single warm, static
 * message telling the patient a person will reply — instead of an AI turn. The
 * PT's inbox and manual chat are never blocked; only the automated AI reply is.
 *
 * `deterministic-cap-handoff` joins the existing deterministic model markers
 * (`deterministic-reminder-response`, `deterministic-failure-handoff`); C4 will
 * centralize that allowlist for cost queries. This message carries no plan/limit/AI language — that lives on the
 * PT-facing surfaces (push, bell, chat banner), not in the patient's chat.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { conversations, messages } from '@/lib/db/schema';
import type { InboundMessage, OutboundMessage } from '@/lib/conversation/types';
import { conversationDayKeys } from './usage';

export const CAP_HANDOFF_MODEL = 'deterministic-cap-handoff';

/** One static, patient-facing Albanian handoff. Reviewable in one place. */
export const CAP_HANDOFF_MESSAGE_SQ =
  'Faleminderit për mesazhin! Do t’ju përgjigjemi personalisht sa më shpejt.';

const OUTBOUND_COLUMNS = {
  id: messages.id,
  conversationId: messages.conversationId,
  replyToMessageId: messages.replyToMessageId,
  content: messages.content,
  channel: messages.channel,
} as const;

async function findExistingHandoff(
  inbound: InboundMessage,
): Promise<OutboundMessage | null> {
  const [existing] = await db
    .select(OUTBOUND_COLUMNS)
    .from(messages)
    .where(
      and(
        eq(messages.ptId, inbound.ptId),
        eq(messages.conversationId, inbound.conversationId),
        eq(messages.role, 'ai'),
        eq(messages.replyToMessageId, inbound.id),
      ),
    )
    .limit(1);
  if (!existing?.replyToMessageId) return null;
  return existing as OutboundMessage;
}

async function persistCapHandoffReply(
  inbound: InboundMessage,
): Promise<OutboundMessage> {
  const [inserted] = await db
    .insert(messages)
    .values({
      ptId: inbound.ptId,
      conversationId: inbound.conversationId,
      replyToMessageId: inbound.id,
      role: 'ai',
      channel: inbound.channel,
      content: CAP_HANDOFF_MESSAGE_SQ,
      model: CAP_HANDOFF_MODEL,
      provider: 'internal',
      tokensIn: 0,
      tokensOut: 0,
      cachedTokens: 0,
      aiCostMicrousd: 0,
    })
    .onConflictDoNothing()
    .returning(OUTBOUND_COLUMNS);

  if (inserted?.replyToMessageId) return inserted as OutboundMessage;
  const existing = await findExistingHandoff(inbound);
  if (existing) return existing;
  throw new Error('Cap handoff insert conflicted without an existing reply');
}

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

  const outbound = await persistCapHandoffReply(args.inbound);
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
