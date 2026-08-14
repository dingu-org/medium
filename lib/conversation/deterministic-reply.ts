/**
 * The idempotent insert behind every fixed-text assistant reply — the cap
 * hard-stop handoff and the non-text notice today, whichever comes next
 * tomorrow. No model round produced these words, so provider/token/cost are
 * pinned to `internal`/0 here rather than at each call site: a fixed sentence
 * that reported tokens would inflate the cost dashboard for messages that never
 * cost anything.
 *
 * Idempotency comes from `messages_ai_reply_to_uq` (one AI reply per inbound):
 * the insert conflicts on a retry and the existing row is returned, so a
 * redelivered job re-sends the same message instead of writing a second one.
 */
import { and, eq } from 'drizzle-orm';
import { db, type DB, type DBTransaction } from '@/lib/db';
import { messages } from '@/lib/db/schema';
import type { InboundMessage, OutboundMessage } from './types';

const OUTBOUND_COLUMNS = {
  id: messages.id,
  conversationId: messages.conversationId,
  replyToMessageId: messages.replyToMessageId,
  content: messages.content,
  channel: messages.channel,
} as const;

async function findExistingReply(
  inbound: InboundMessage,
  executor: DB | DBTransaction,
): Promise<OutboundMessage | null> {
  const [existing] = await executor
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

export async function persistDeterministicReply(args: {
  inbound: InboundMessage;
  content: string;
  /** Deterministic model marker, e.g. `deterministic-cap-handoff`. */
  model: string;
  /** Set to join a caller's transaction (the non-text notice arms an offer). */
  executor?: DB | DBTransaction;
}): Promise<OutboundMessage> {
  const executor = args.executor ?? db;
  const [inserted] = await executor
    .insert(messages)
    .values({
      ptId: args.inbound.ptId,
      conversationId: args.inbound.conversationId,
      replyToMessageId: args.inbound.id,
      role: 'ai',
      channel: args.inbound.channel,
      content: args.content,
      model: args.model,
      provider: 'internal',
      tokensIn: 0,
      tokensOut: 0,
      cachedTokens: 0,
      aiCostMicrousd: 0,
    })
    .onConflictDoNothing()
    .returning(OUTBOUND_COLUMNS);

  if (inserted?.replyToMessageId) return inserted as OutboundMessage;

  const existing = await findExistingReply(args.inbound, executor);
  if (existing) return existing;
  throw new Error(
    `Deterministic reply insert conflicted without an existing reply (${args.model})`,
  );
}
