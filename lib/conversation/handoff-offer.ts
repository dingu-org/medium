/**
 * The handoff offer (2026-08-14). When the assistant decides a request is
 * outside what it can do — anything that is not booking, rescheduling,
 * cancelling, or answering about services and availability — it does not guess
 * and it does not classify the request. It calls `offer_human_handoff`, and the
 * engine answers with one static, vertical-agnostic sentence offering to pass
 * the question on. Nothing here inspects what the customer asked; the model is
 * the only judge of scope.
 *
 * Acceptance is an affirmative reply, and only the message immediately after
 * the offer can be it. That bound is the whole point: PO is Albanian for "yes",
 * and it is what a customer types to take a proposed time slot. A looser rule
 * would turn every slot confirmation into a permanent handoff. The bound is
 * enforced by anchoring the offer to the customer message it answered
 * (`conversations.handoff_offer_message_id`) and accepting only when that
 * message is still the one directly before the incoming message — so an offer
 * lapses by itself, with no code path having to remember to clear a flag.
 */
import { and, desc, eq, lt } from 'drizzle-orm';
import type { DB, DBTransaction } from '@/lib/db';
import { conversations, messages } from '@/lib/db/schema';
import { isAffirmative } from '@/lib/language/reply-intent';
import { getServiceClient } from '@/lib/tenancy';
import type { InboundMessage } from './types';

/**
 * The word the offer asks for. Asking for one clear word is the UX; it is not
 * the acceptance rule — see {@link isHandoffAcceptance}, which takes any
 * affirmative, because that is what customers send back.
 */
export const HANDOFF_ACCEPTANCE_WORD = 'PO';

/** Model marker for the acceptance reply: fixed text, no model round behind it. */
export const HANDOFF_ACCEPTED_MODEL = 'deterministic-handoff-accepted';

/**
 * Stand-in for a practice that never filled its name in. Vertical-neutral by
 * requirement: Medium books appointments for barbers and nail salons as well as
 * physiotherapists, so no customer-facing sentence may name a discipline. In
 * Albanian this sits in the dative, which is the case both sentences below need
 * ("ia kalova biznesit" = "I passed it to the business").
 */
export const DEFAULT_BUSINESS_LABEL_SQ = 'biznesit';

export function businessLabel(name: string | null): string {
  return name?.trim() || DEFAULT_BUSINESS_LABEL_SQ;
}

/**
 * The one static offer, used for every out-of-scope request there is. It names
 * no vertical, promises nothing about response time, and gives no emergency
 * guidance — deliberately, because this product schedules appointments and is
 * not a medical one.
 */
export function handoffOfferMessage(business: string): string {
  return `Mund të ndihmoj vetëm me takimet. Nëse dëshironi t'ia kaloj këtë pyetje ${business}, përgjigjuni me ${HANDOFF_ACCEPTANCE_WORD}.`;
}

/** Sent once the customer accepts; the assistant is silent after it. */
export function handoffAcceptedMessage(business: string): string {
  return `Patjetër. Këtë bisedë ia kalova ${business}; do t'ju përgjigjen sapo të jenë të lirë.`;
}

/**
 * Whether this message accepts the offer — the product's one shared definition
 * of an affirmative (lib/language/reply-intent.ts), the same one an unanswered
 * reminder confirms a booking with.
 *
 * Shared because the two are rivals for the same reply. While a reminder and an
 * offer are both outstanding, whichever question was asked most recently should
 * win it (`resolveInboundClaim` in
 * lib/inngest/functions/handle-inbound-message.ts) — but that comparison only
 * ever runs on a message both could claim. This used to demand exact equality
 * with PO, so "po faleminderit" was not a message the offer could claim and was
 * never weighed: the reminder took it, an appointment the customer had not been
 * asked about was confirmed, and their actual question was silently dropped.
 * A difference in spelling rules decided it, which is not a rule anyone chose.
 *
 * The offer copy still asks for the one bare word, deliberately — telling a
 * customer exactly what to type is good UX. Also accepting what they actually
 * type is the fix, not a contradiction.
 *
 * The looseness this buys is bounded by the caller, not by the wording:
 * `handoffOfferOutcome` accepts only the message directly after the offer, so a
 * bare "ok" reads as an acceptance in exactly the one position where "ok" is
 * answering the offer. Misreading it there escalates to the PT — recoverable,
 * and in the direction where a human sees a real question. The old asymmetry
 * misread in the other direction, and that one mutated a booking.
 *
 * Nothing here is a *whole-message* rule any more, but the parse keeps the
 * guards that mattered: "po, por a mund ta ndryshoj orën?" is too long to be a
 * bare answer, and "Po pyesja…" is the progressive particle, not a yes. Both
 * still get a normal AI turn, which can offer again.
 */
export function isHandoffAcceptance(content: string): boolean {
  return isAffirmative(content);
}

/**
 * Arm the offer against the message it answered. Runs in the caller's
 * transaction so the anchor and the offer message commit together: an anchor
 * without a sent offer would let an ordinary "po" — the way a customer takes a
 * proposed slot — escalate a conversation that was never offered anything.
 */
export async function armHandoffOffer(
  tx: DBTransaction,
  inbound: InboundMessage,
): Promise<void> {
  await tx
    .update(conversations)
    .set({ handoffOfferMessageId: inbound.id })
    .where(
      and(
        eq(conversations.id, inbound.conversationId),
        eq(conversations.accountId, inbound.accountId),
      ),
    );
}

/**
 * The offer currently armed on this conversation, with the instant it was made:
 * the `created_at` of the customer message it answered, which is the message the
 * anchor points at. Null when nothing is outstanding.
 *
 * The timestamp exists so an outstanding offer can be weighed against another
 * question the customer may be answering instead — see `resolveInboundClaim` in
 * lib/inngest/functions/handle-inbound-message.ts.
 */
export async function outstandingHandoffOffer(args: {
  accountId: string;
  conversationId: string;
}): Promise<{ messageId: string; offeredAt: Date } | null> {
  const svc = getServiceClient(args.accountId);
  const [row] = await svc.db
    .select({ messageId: messages.id, offeredAt: messages.createdAt })
    .from(conversations)
    .innerJoin(messages, eq(messages.id, conversations.handoffOfferMessageId))
    .where(
      and(
        eq(conversations.id, args.conversationId),
        eq(conversations.accountId, args.accountId),
      ),
    )
    .limit(1);

  return row ?? null;
}

/**
 * Whether the outstanding offer claims this inbound message — a read, with no
 * side effect, so a caller can weigh the answer before anything acts on it.
 *
 * `accepted` requires both halves: the anchored message is still the customer's
 * most recent one before this inbound (so this is literally the next message),
 * and this message is an affirmative. Anything else lapses and is handled as an
 * ordinary turn.
 */
export async function handoffOfferOutcome(args: {
  inbound: InboundMessage;
  offerMessageId: string;
}): Promise<'accepted' | 'lapsed'> {
  const svc = getServiceClient(args.inbound.accountId);
  const [previous] = await svc.db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.accountId, args.inbound.accountId),
        eq(messages.conversationId, args.inbound.conversationId),
        eq(messages.role, 'customer'),
        // Strictly earlier, so the inbound itself is never its own predecessor.
        lt(messages.createdAt, args.inbound.occurredAt),
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(1);

  const isNextMessage = previous?.id === args.offerMessageId;
  return isNextMessage && isHandoffAcceptance(args.inbound.content)
    ? 'accepted'
    : 'lapsed';
}

/**
 * Disarm the offer. Guarded on the anchor still being the one that was read, so
 * a clear can never discard an offer armed after that read.
 *
 * Takes an executor because the accepted case has to clear the anchor in the
 * same transaction as the reply it sends: clearing on its own would let a crash
 * before the reply drop the acceptance on the retry.
 */
export async function clearHandoffOffer(args: {
  inbound: InboundMessage;
  offerMessageId: string;
  executor?: DB | DBTransaction;
}): Promise<void> {
  const executor = args.executor ?? getServiceClient(args.inbound.accountId).db;
  await executor
    .update(conversations)
    .set({ handoffOfferMessageId: null })
    .where(
      and(
        eq(conversations.id, args.inbound.conversationId),
        eq(conversations.accountId, args.inbound.accountId),
        eq(conversations.handoffOfferMessageId, args.offerMessageId),
      ),
    );
}
