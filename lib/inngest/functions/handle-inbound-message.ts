import { and, desc, eq, isNull } from 'drizzle-orm';
import { APICallError } from 'ai';
import {
  NonRetriableError,
  type GetFunctionInput,
  type GetStepTools,
} from 'inngest';
import { db } from '@/lib/db';
import {
  conversations,
  messages,
  customers,
  accounts,
  whatsappConnections,
} from '@/lib/db/schema';
import { sendFreeForm } from '@/lib/channels/whatsapp/client';
import { resolveEffectivePlan } from '@/lib/billing/entitlements';
import {
  handOffCappedConversation,
  markCapHandoff,
  prepareCapHandoff,
} from '@/lib/billing/cap-handoff';
import type { PlanId } from '@/lib/billing/plans';
import { checkAndRecordConversation } from '@/lib/billing/usage';
import { ConversationEngineError } from '@/lib/conversation/errors';
import {
  clearHandoffOffer,
  handoffOfferOutcome,
  outstandingHandoffOffer,
} from '@/lib/conversation/handoff-offer';
import {
  markNonTextNotice,
  prepareNonTextNotice,
} from '@/lib/conversation/non-text';
import type {
  InboundMessage,
  OutboundMessage,
  ReminderTurnContext,
} from '@/lib/conversation/types';
import { appendBackgroundEvent } from '@/lib/events/background';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import { createLogger } from '@/lib/log';
import { dispatchPushForEvent } from '@/lib/notifications/push-dispatch';
import { remindersEnabled } from '@/lib/reminders/flag';
import {
  handleReminderResponse,
  pendingReminderSentAt,
  type ReminderHandlingResult,
} from '@/lib/reminders/response-handler';
import { inngest } from '../client';

type RunTurn = typeof import('@/lib/conversation/engine').runTurn;
type RunReminderTurn =
  typeof import('@/lib/conversation/engine').runReminderTurn;

export type InboundJobContext = {
  inbound: Omit<InboundMessage, 'occurredAt'> & { occurredAt: string };
  aiActive: boolean;
  /**
   * The assistant is off for this conversation for a reason that warrants a
   * manual-reply push (PT takeover or an open escalation) — i.e. `aiActive` is
   * false and NOT because of a current WhatsApp Business app echo pause. During
   * an echo pause the PT is already replying from their phone, so pushing would
   * be redundant; that case is excluded here.
   */
  manualHandling: boolean;
  assistantPaused: boolean;
  /** Effective (grace-aware) plan resolved at load time (Phase 16 C1). */
  plan: PlanId;
  /** PT timezone — the calendar boundary for conversation-day metering (C2). */
  timezone: string;
  /** Names the business in the deterministic non-text notice's handoff offer. */
  name: string | null;
  connectionId: string | null;
  recipient: string | null;
};

function hydrateInbound(inbound: InboundJobContext['inbound']): InboundMessage {
  return {
    ...inbound,
    occurredAt: new Date(inbound.occurredAt),
  };
}

export async function loadInboundJobContext(args: {
  messageId: string;
  accountId: string;
  conversationId: string;
}): Promise<InboundJobContext | null> {
  const [row] = await db
    .select({
      messageId: messages.id,
      content: messages.content,
      channel: messages.channel,
      externalId: messages.externalId,
      createdAt: messages.createdAt,
      conversationId: conversations.id,
      aiActive: conversations.aiActive,
      aiPausedUntil: conversations.aiPausedUntil,
      aiPauseReason: conversations.aiPauseReason,
      customerId: customers.id,
      waId: customers.waId,
      assistantPaused: accounts.assistantPaused,
      plan: accounts.plan,
      planLifetime: accounts.planLifetime,
      planExpiresAt: accounts.planExpiresAt,
      timezone: accounts.timezone,
      name: accounts.name,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .innerJoin(customers, eq(conversations.customerId, customers.id))
    .innerJoin(accounts, eq(conversations.accountId, accounts.id))
    .where(
      and(
        eq(messages.id, args.messageId),
        eq(messages.accountId, args.accountId),
        eq(messages.role, 'customer'),
        eq(conversations.id, args.conversationId),
        eq(conversations.accountId, args.accountId),
        eq(customers.accountId, args.accountId),
      ),
    )
    .limit(1);

  if (!row) return null;

  let aiActive = row.aiActive;
  if (
    row.aiPauseReason === 'whatsapp_business_app_echo' &&
    row.aiPausedUntil
  ) {
    if (row.aiPausedUntil.getTime() <= Date.now()) {
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
            eq(conversations.id, row.conversationId),
            eq(conversations.accountId, args.accountId),
            eq(conversations.aiPauseReason, 'whatsapp_business_app_echo'),
            eq(conversations.aiPausedUntil, row.aiPausedUntil),
          ),
        )
        .returning({ id: conversations.id });
      aiActive = Boolean(updated);
    } else {
      aiActive = false;
    }
  }

  // Nothing in the schema limits a PT to one active connection, so the pick
  // must be deterministic: newest active row wins, matching every other
  // consumer (lib/channels/whatsapp/client.ts, chat/actions.ts, pwa routes).
  const [connection] = await db
    .select({ id: whatsappConnections.id })
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.accountId, args.accountId),
        eq(whatsappConnections.status, 'active'),
      ),
    )
    .orderBy(desc(whatsappConnections.createdAt))
    .limit(1);

  return {
    inbound: {
      id: row.messageId,
      conversationId: row.conversationId,
      accountId: args.accountId,
      customerId: row.customerId,
      content: row.content,
      channel: row.channel,
      externalId: row.externalId,
      occurredAt: row.createdAt.toISOString(),
    },
    aiActive,
    // Echo-pause exclusion: only genuine manual handling (takeover/escalation)
    // qualifies, never a Business app echo pause the PT is actively replying to.
    manualHandling:
      !aiActive && row.aiPauseReason !== 'whatsapp_business_app_echo',
    assistantPaused: row.assistantPaused,
    plan: resolveEffectivePlan(
      {
        plan: row.plan,
        planLifetime: row.planLifetime,
        planExpiresAt: row.planExpiresAt,
      },
      new Date(),
    ),
    timezone: row.timezone,
    name: row.name,
    connectionId: connection?.id ?? null,
    recipient: row.waId,
  };
}

/** Which outstanding question this message is taken to answer. */
export type InboundClaim = 'reminder' | 'handoff_offer';

/**
 * Two subsystems can claim the same one-word reply, and neither knows about the
 * other: a yes is what an unanswered reminder reads as a confirmation
 * (lib/language/reply-intent.ts) and it is also what the handoff offer asks
 * for. The reminder handler runs first and returns before the engine, so
 * without this gate a bare PO always confirmed the appointment, the escalation
 * never happened, and the customer was answered about something they had not
 * asked about.
 *
 * The owner's rule (2026-08-14): whichever question was asked most recently
 * wins, because both orderings genuinely occur — a scheduled reminder can land
 * after an offer, and an offer can be made after a reminder — so any fixed
 * winner would be wrong about half the time.
 *
 * Only a message both could claim is weighed at all. The offer can claim
 * exactly the messages `handoffOfferOutcome` accepts (an affirmative, and only
 * as the message directly after the offer); anything else is not an answer to
 * the offer, so the reminder handler keeps it and today's deterministic
 * ANULO/RICAKTO paths are untouched.
 *
 * Both sides read "affirmative" out of lib/language/reply-intent.ts, and they
 * have to: while the offer demanded exact equality with PO and the reminder
 * accepted 'dakord', 'ok' and 'po' plus one word, everything in the gap — "po
 * faleminderit" — bypassed this comparison entirely and went to whichever
 * subsystem runs first, which is always the reminder.
 *
 * When the reminder wins the offer lapses here, consistent with the rule that
 * only the immediately-next message can accept: the customer answered the
 * reminder, not the offer, so the anchor is cleared rather than left armed
 * against some later, unrelated message.
 */
export async function resolveInboundClaim(
  inbound: InboundMessage,
): Promise<InboundClaim> {
  const offer = await outstandingHandoffOffer({
    accountId: inbound.accountId,
    conversationId: inbound.conversationId,
  });
  if (!offer) return 'reminder';

  const outcome = await handoffOfferOutcome({
    inbound,
    offerMessageId: offer.messageId,
  });
  // Not an acceptance: the offer cannot claim this message, so there is nothing
  // to weigh. It lapses in the engine as it always has.
  if (outcome !== 'accepted') return 'reminder';

  const reminderSentAt = await pendingReminderSentAt(inbound);
  if (!reminderSentAt) return 'handoff_offer';
  // Strictly newer, so an exact tie goes to the reminder rather than being
  // decided by whichever row the comparison happened to see first. Not just
  // theory: Postgres keeps these to the microsecond but a JS `Date` truncates to
  // the millisecond, so an offer made within 999µs of the reminder ties here.
  // The reminder is the safer side of that coin — confirming an appointment the
  // customer does hold is recoverable, and the offer is re-made the moment they
  // ask again.
  if (offer.offeredAt.getTime() > reminderSentAt.getTime()) {
    return 'handoff_offer';
  }

  await clearHandoffOffer({ inbound, offerMessageId: offer.messageId });
  return 'reminder';
}

export async function runInboundTurn(
  context: InboundJobContext,
  runTurnFn?: RunTurn,
): Promise<
  | { kind: 'outbound'; outbound: OutboundMessage }
  | { kind: 'skipped'; reason: string }
> {
  try {
    const executeTurn =
      runTurnFn ?? (await import('@/lib/conversation/engine')).runTurn;
    const outbound = await executeTurn({
      inboundMessage: hydrateInbound(context.inbound),
      plan: context.plan,
    });
    return { kind: 'outbound', outbound };
  } catch (error) {
    if (
      error instanceof ConversationEngineError &&
      (error.code === 'conversation_not_found' ||
        error.code === 'conversation_inactive' ||
        error.code === 'assistant_paused')
    ) {
      return { kind: 'skipped', reason: error.code };
    }
    if (APICallError.isInstance(error) && !error.isRetryable) {
      throw new NonRetriableError(error.message, { cause: error });
    }
    throw error;
  }
}

export async function runReminderFallbackTurn(
  context: InboundJobContext,
  reminder: ReminderTurnContext,
  runReminderTurnFn?: RunReminderTurn,
): Promise<{ kind: 'outbound'; outbound: OutboundMessage }> {
  const executeTurn =
    runReminderTurnFn ??
    (await import('@/lib/conversation/engine')).runReminderTurn;
  const outbound = await executeTurn({
    inboundMessage: hydrateInbound(context.inbound),
    reminder,
    plan: context.plan,
  });
  return { kind: 'outbound', outbound };
}

export async function sendInboundReply(args: {
  outbound: OutboundMessage;
  connectionId: string;
  recipient: string;
  sendFn?: typeof sendFreeForm;
}): Promise<{ messageId: string; alreadyDelivered: boolean }> {
  const [stored] = await db
    .select({ externalId: messages.externalId })
    .from(messages)
    .where(eq(messages.id, args.outbound.id))
    .limit(1);

  if (stored?.externalId) {
    return { messageId: stored.externalId, alreadyDelivered: true };
  }

  const result = await (args.sendFn ?? sendFreeForm)(
    args.connectionId,
    args.recipient,
    args.outbound.content,
  );
  if (!result.messageId) {
    throw new Error(
      'WhatsApp accepted the reply without returning a message ID',
    );
  }
  return { messageId: result.messageId, alreadyDelivered: false };
}

export async function persistInboundReplyDelivery(args: {
  outboundId: string;
  messageId: string;
}): Promise<void> {
  await db
    .update(messages)
    .set({ externalId: args.messageId })
    .where(and(eq(messages.id, args.outboundId), isNull(messages.externalId)));
}

/**
 * The bell feed reads `conversation.failed` out of the `events` table, so the
 * exhausted turn has to be appended there (a bare `step.sendEvent` has no
 * subscriber and leaves no row). Publishing the outbox row afterwards keeps the
 * Inngest emission for any future consumer.
 */
export async function recordConversationFailure(args: {
  accountId: string;
  conversationId: string;
  messageId: string;
  traceId?: string;
}): Promise<void> {
  const eventId = await db.transaction((tx) =>
    appendBackgroundEvent(tx, {
      type: 'conversation.failed',
      data: {
        accountId: args.accountId,
        conversationId: args.conversationId,
        messageId: args.messageId,
        traceId: args.traceId,
      },
    }),
  );
  await tryPublishOutboxEvent(eventId);
}

async function recoverFailedInbound(args: {
  messageId: string;
  accountId: string;
  conversationId: string;
  traceId?: string;
  step: GetStepTools<typeof inngest>;
}) {
  await args.step.run('record-conversation-failed', () =>
    recordConversationFailure({
      accountId: args.accountId,
      conversationId: args.conversationId,
      messageId: args.messageId,
      traceId: args.traceId,
    }),
  );

  const context = await args.step.run('load-failed-context', () =>
    loadInboundJobContext(args),
  );
  if (!context?.connectionId || !context.recipient) {
    return { recovered: false, reason: 'delivery_context_missing' };
  }

  const outbound = await args.step.run('create-failure-handoff', async () => {
    const { handoffFailedTurn } = await import('@/lib/conversation/engine');
    return handoffFailedTurn({
      inboundMessage: hydrateInbound(context.inbound),
    });
  });
  const delivery = await args.step.run('send-failure-handoff', () =>
    sendInboundReply({
      outbound,
      connectionId: context.connectionId!,
      recipient: context.recipient!,
    }),
  );
  await args.step.run('persist-failure-delivery', () =>
    persistInboundReplyDelivery({
      outboundId: outbound.id,
      messageId: delivery.messageId,
    }),
  );
  return { recovered: true };
}

/**
 * The handler is a named export so the reminder kill switch on `claim` /
 * `deterministicReminders` below can be exercised by running the shipped line
 * rather than a copy of it: `handleInboundMessage` is an `InngestFunction`
 * whose handler is private, and there is no test engine in this repo.
 * `createFunction` receives this same function, so what the tests call is what
 * Inngest runs. (Same shape as `sendReminderHandler` in ./send-reminder.ts.)
 */
export async function handleInboundMessageHandler({
  event,
  step,
  runId,
}: GetFunctionInput<typeof inngest, 'message.received'>) {
  // Continue the webhook's trace through Inngest to the outbound send; fall
  // back to the run id when the event carries no trace (criterion 6). These
  // entry/exit lines all share trace_id.
  const trace_id = event.data.traceId ?? runId;
  const log = createLogger({
    trace_id,
    account_id: event.data.accountId,
    conversation_id: event.data.conversationId,
  });
  log.info('inbound.processing', 'Processing inbound message', {
    message_id: event.data.messageId,
  });

  const context = await step.run('load-context', () =>
    loadInboundJobContext(event.data),
  );
  if (!context) return { skipped: 'conversation_not_found' };
  if (!context.connectionId || !context.recipient) {
    return { skipped: 'delivery_context_missing' };
  }

  // A body the assistant cannot read: the stored content is our own
  // placeholder, so there is nothing here that could be a reminder answer
  // (those are typed words) and nothing worth a keyword lookup.
  //
  // Globally paused ⇒ no automated reminder mutation or confirmation reply
  // either; the inbound routes through the engine, which skips it as
  // `assistant_paused` (the single logging/skip choke point).
  const nonText = event.data.nonText === true;
  //
  // `remindersEnabled()` is the kill switch (lib/reminders/flag.ts). With
  // reminders off this is false, so `claim` short-circuits to 'reminder'
  // without running the `resolve-turn-precedence` step,
  // `handleReminderResponse` is never called, `reminder` stays
  // `{ kind: 'none' }`, and the message falls through to the ordinary AI turn
  // below — the assistant reads "PO" as the customer's words, not as a
  // reminder confirmation.
  //
  // This single flag also closes the reminder *fallback* path, so
  // `runReminderFallbackTurn` and the engine's `runReminderTurn` deliberately
  // carry no gate of their own: the fallback runs only when
  // `reminder.kind === 'fallback'`, and `handleReminderResponse` — unreachable
  // above — is the only thing that produces that kind. A second check there
  // would be dead code that implies some other caller exists.
  const deterministicReminders =
    !(context.assistantPaused || nonText) && remindersEnabled();
  // Ahead of the reminder step, never inside it: the handler returns an
  // outbound and ends the run, so once it has claimed the message the engine
  // — and with it the acceptance of an outstanding handoff offer — is already
  // unreachable.
  const claim: InboundClaim = deterministicReminders
    ? await step.run('resolve-turn-precedence', () =>
        resolveInboundClaim(hydrateInbound(context.inbound)),
      )
    : 'reminder';
  const reminder: ReminderHandlingResult =
    deterministicReminders && claim === 'reminder'
      ? await step.run('handle-reminder-response', () =>
          handleReminderResponse({ inbound: hydrateInbound(context.inbound) }),
        )
      : { kind: 'none' };
  if (reminder.kind === 'outbound') {
    const delivery = await step.run('send-reminder-response', () =>
      sendInboundReply({
        outbound: reminder.outbound,
        connectionId: context.connectionId!,
        recipient: context.recipient!,
      }),
    );
    await step.run('persist-reminder-response-delivery', () =>
      persistInboundReplyDelivery({
        outboundId: reminder.outbound.id,
        messageId: delivery.messageId,
      }),
    );

    log.info('inbound.reply_sent', 'Outbound AI reply sent', {
      message_id: event.data.messageId,
      wa_message_id: delivery.messageId,
    });
    return {
      outboundMessageId: reminder.outbound.id,
      externalId: delivery.messageId,
      replay: delivery.alreadyDelivered,
      reminder: true,
    };
  }

  // Takeover on a non-fallback inbound is the PT handling it manually — never
  // metered. (A reminder AI fallback runs even during takeover, so it is
  // excluded here and does get metered below.)
  if (reminder.kind !== 'fallback' && !context.aiActive) {
    // The assistant won't answer, so the customer's message needs a manual
    // reply — push a nudge (push-only, no bell entry). Echo-paused
    // conversations are excluded via `manualHandling`; the per-conversation
    // device tag collapses a burst of messages into one notification. The
    // function's messageId idempotency + step memoization keep it single-send
    // across retries.
    if (context.manualHandling) {
      await step.run('notify-manual-reply', () =>
        dispatchPushForEvent({
          name: 'conversation.needs_reply',
          data: {
            accountId: context.inbound.accountId,
            conversationId: context.inbound.conversationId,
            customerId: context.inbound.customerId,
            traceId: event.data.traceId,
          },
        }),
      );
    }
    return { skipped: 'conversation_inactive' };
  }

  // The assistant cannot read this body, and it never becomes an AI turn:
  // handing our own `[mesazh zanor]` placeholder to the model would have it
  // invent what the voice note said. One fixed notice per conversation per
  // day instead, carrying the same handoff offer as any out-of-scope
  // question. Placed after the takeover check above (a PT already handling
  // the thread gets the nudge, not an assistant talking over them) and before
  // the cap gate (no model round happened, so nothing is metered).
  if (nonText) {
    // Every non-text inbound tells the professional, before any branch below
    // can decide the customer hears nothing. Until now a photo produced a
    // customer-facing notice and no professional-facing signal at all, and the
    // *second* photo of the day produced nothing for anyone: the notice is
    // throttled to one per conversation per day, so silence on both sides. The
    // push is unconditional here for that reason — the throttled path and the
    // globally-paused path are exactly the ones that need it most.
    //
    // No new event type. `conversation.needs_reply` ("Mesazh i ri — X të
    // dërgoi një mesazh") is accurate: the professional opens the thread and
    // reads `[foto]` / `[mesazh zanor]` for themselves. It also maps to the
    // existing `manualReply` preference, so this needs no Settings toggle and
    // no `NOTIFICATION_TYPES` entry.
    //
    // Push yes, bell no: this is a "reply now" nudge whose value decays in
    // hours, and the durable record is the unread badge the webhook's
    // `messages` row already writes. The per-conversation device tag
    // (`conversation-${id}-reply`) collapses a burst of media into one
    // notification, so this cannot spam. Non-text still never sets
    // `aiActive = false` — notifying and stopping the AI are independent.
    await step.run('notify-non-text', () =>
      dispatchPushForEvent({
        name: 'conversation.needs_reply',
        data: {
          accountId: context.inbound.accountId,
          conversationId: context.inbound.conversationId,
          customerId: context.inbound.customerId,
          traceId: event.data.traceId,
        },
      }),
    );

    // The engine is the single skip choke point for text; this branch never
    // reaches it, so it owns the same line for a globally paused assistant.
    if (context.assistantPaused) {
      log.info(
        'inbound.non_text',
        'Non-text message stored; assistant globally paused',
        { message_id: event.data.messageId },
      );
      return { skipped: 'assistant_paused' };
    }

    const notice = await step.run('prepare-non-text-notice', () =>
      prepareNonTextNotice({
        inbound: hydrateInbound(context.inbound),
        name: context.name,
        timezone: context.timezone,
        instant: new Date(context.inbound.occurredAt),
      }),
    );
    if (notice.action === 'skip') {
      log.info(
        'inbound.non_text',
        'Non-text message stored; notice already sent today',
        { message_id: event.data.messageId },
      );
      return { nonText: true, noticeSent: false };
    }

    const delivery = await step.run('send-non-text-notice', () =>
      sendInboundReply({
        outbound: notice.outbound,
        connectionId: context.connectionId!,
        recipient: context.recipient!,
      }),
    );
    await step.run('persist-non-text-notice-delivery', () =>
      persistInboundReplyDelivery({
        outboundId: notice.outbound.id,
        messageId: delivery.messageId,
      }),
    );
    await step.run('mark-non-text-notice', () =>
      markNonTextNotice({
        accountId: context.inbound.accountId,
        conversationId: context.inbound.conversationId,
        instant: new Date(context.inbound.occurredAt),
      }),
    );

    log.info('inbound.non_text', 'Non-text message stored; notice sent', {
      message_id: event.data.messageId,
      wa_message_id: delivery.messageId,
    });
    return {
      nonText: true,
      noticeSent: true,
      outboundMessageId: notice.outbound.id,
      externalId: delivery.messageId,
    };
  }

  // Meter the conversation-day and enforce the monthly cap. Paused
  // conversations skip the gate (not counted) — the engine self-skips as
  // `assistant_paused` before any model call. The metering instant is the
  // customer message's own timestamp (not wall-clock) so Inngest retries land
  // on the same billing day and month.
  if (!context.assistantPaused) {
    const gate = await step.run('check-conversation-cap', () =>
      checkAndRecordConversation({
        accountId: context.inbound.accountId,
        customerId: context.inbound.customerId,
        conversationId: context.inbound.conversationId,
        plan: context.plan,
        timezone: context.timezone,
        inboundMessageId: context.inbound.id,
        instant: new Date(context.inbound.occurredAt),
        traceId: event.data.traceId,
      }),
    );

    if (gate.status === 'at_cap') {
      // The assistant is out of conversations for the month, so this customer
      // needs a person — no offer to make, nothing to ask. Hand the thread
      // over and push before the customer's holding message: whatever happens
      // to the send, the PT knows someone is waiting. This is also what keeps
      // the 2nd..Nth message of a capped day visible — they take the
      // manual-handling path above instead of hitting the throttled handoff.
      await step.run('hand-off-capped-conversation', () =>
        handOffCappedConversation({
          accountId: context.inbound.accountId,
          conversationId: context.inbound.conversationId,
          customerId: context.inbound.customerId,
          traceId: event.data.traceId,
        }),
      );

      const prep = await step.run('prepare-cap-handoff', () =>
        prepareCapHandoff({
          inbound: hydrateInbound(context.inbound),
          timezone: context.timezone,
          instant: new Date(context.inbound.occurredAt),
        }),
      );
      if (prep.action === 'skip') {
        log.info('inbound.capped', 'Conversation cap reached; handoff already sent today', {
          message_id: event.data.messageId,
        });
        return { capped: true, handoffSent: false };
      }

      const delivery = await step.run('send-cap-handoff', () =>
        sendInboundReply({
          outbound: prep.outbound,
          connectionId: context.connectionId!,
          recipient: context.recipient!,
        }),
      );
      await step.run('persist-cap-handoff-delivery', () =>
        persistInboundReplyDelivery({
          outboundId: prep.outbound.id,
          messageId: delivery.messageId,
        }),
      );
      await step.run('mark-cap-handoff', () =>
        markCapHandoff({
          accountId: context.inbound.accountId,
          conversationId: context.inbound.conversationId,
          instant: new Date(context.inbound.occurredAt),
        }),
      );

      log.info('inbound.capped', 'Conversation cap reached; static handoff sent', {
        message_id: event.data.messageId,
        wa_message_id: delivery.messageId,
      });
      return { capped: true, handoffSent: true };
    }
  }

  let turn:
    | { kind: 'outbound'; outbound: OutboundMessage }
    | { kind: 'skipped'; reason: string };
  if (reminder.kind === 'fallback') {
    turn = await step.run('run-reminder-ai-turn', () =>
      runReminderFallbackTurn(context, reminder.reminder),
    );
  } else {
    turn = await step.run('run-ai-turn', () => runInboundTurn(context));
  }
  if (turn.kind === 'skipped') return { skipped: turn.reason };

  const delivery = await step.run('send-outbound', () =>
    sendInboundReply({
      outbound: turn.outbound,
      connectionId: context.connectionId!,
      recipient: context.recipient!,
    }),
  );
  await step.run('persist-delivery', () =>
    persistInboundReplyDelivery({
      outboundId: turn.outbound.id,
      messageId: delivery.messageId,
    }),
  );

  log.info('inbound.reply_sent', 'Outbound AI reply sent', {
    message_id: event.data.messageId,
    wa_message_id: delivery.messageId,
  });
  return {
    outboundMessageId: turn.outbound.id,
    externalId: delivery.messageId,
    replay: delivery.alreadyDelivered,
  };
}

export const handleInboundMessage = inngest.createFunction(
  {
    id: 'handle-inbound-message',
    retries: 2,
    idempotency: 'event.data.messageId',
    // One run per conversation at a time, so two rapid messages cannot answer
    // over each other. It bounds parallelism only — Inngest does not promise the
    // queued runs execute in arrival order, so anything order-sensitive has to
    // settle it from the messages themselves (`optStateSuperseded` in
    // lib/reminders/response-handler.ts does exactly that for NDAL/AKTIVIZO).
    concurrency: {
      limit: 1,
      key: 'event.data.conversationId',
    },
    onFailure: async ({ event, step }) => {
      const original = event.data.event.data;
      return recoverFailedInbound({
        messageId: original.messageId,
        accountId: original.accountId,
        conversationId: original.conversationId,
        traceId: original.traceId,
        step,
      });
    },
  },
  { event: 'message.received' },
  handleInboundMessageHandler,
);
