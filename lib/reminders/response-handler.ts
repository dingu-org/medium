import { addDays, subHours } from 'date-fns';
import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from 'drizzle-orm';
import { withAdvisoryLock } from '@/lib/db/advisory-lock';
import { db, type DB, type DBTransaction } from '@/lib/db';
import {
  appointments,
  messages,
  customers,
  accounts,
  reminderJobs,
} from '@/lib/db/schema';
import { getFreeSlotsInternal } from '@/lib/appointments/availability';
import { cancelAppointment } from '@/lib/appointments/cancel';
import { transitionAppointment } from '@/lib/appointments/state';
import { formatAppointmentTime } from '@/lib/format/appointment-time';
import type {
  InboundMessage,
  OutboundMessage,
  ReminderTurnContext,
} from '@/lib/conversation/types';
import { parseReplyIntent } from '@/lib/language/reply-intent';

type ReminderResponseType = 'confirm' | 'cancel' | 'reschedule_requested';

// A sent reminder only speaks for its own cycle. Nothing ages a reminder job
// out (completed/no_show are PT-initiated), so without a recency bound a stale
// unanswered job for a long-past appointment hijacks every later "Ok" in the
// conversation. Mirrors the PT-facing unanswered list in lib/today/queries.ts.
//
// Not a tunable product rule: the `endsAt > occurredAt` bound below already
// excludes everything a 24h lead time could produce, so this is defence in
// depth for a future non-24h lead (computeReminderSchedule in
// lib/inngest/functions/send-reminder.ts).
const REMINDER_RESPONSE_WINDOW_HOURS = 48;

type ReminderCandidate = {
  jobId: string;
  appointmentId: string;
  startsAt: Date;
  endsAt: Date;
  /** When the reminder went out — the instant the customer is answering. */
  sentAt: Date | null;
  responseType:
    | 'confirm'
    | 'cancel'
    | 'reschedule_requested'
    | 'opt_out'
    | null;
  responseMessageId: string | null;
  timezone: string;
  name: string | null;
};

export type ReminderHandlingResult =
  | { kind: 'none' }
  | { kind: 'outbound'; outbound: OutboundMessage }
  | { kind: 'fallback'; reminder: ReminderTurnContext };

/** Reads and writes that a caller may need to run inside its own transaction. */
type Executor = DB | DBTransaction;

async function findExistingReply(
  inbound: InboundMessage,
  executor: Executor = db,
): Promise<OutboundMessage | null> {
  const [existing] = await executor
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      replyToMessageId: messages.replyToMessageId,
      content: messages.content,
      channel: messages.channel,
    })
    .from(messages)
    .where(
      and(
        eq(messages.accountId, inbound.accountId),
        eq(messages.conversationId, inbound.conversationId),
        eq(messages.role, 'ai'),
        eq(messages.replyToMessageId, inbound.id),
      ),
    )
    .limit(1);

  if (!existing?.replyToMessageId) return null;
  return existing as OutboundMessage;
}

async function persistReminderReply(args: {
  inbound: InboundMessage;
  content: string;
  executor?: Executor;
}): Promise<OutboundMessage> {
  const executor = args.executor ?? db;
  const [inserted] = await executor
    .insert(messages)
    .values({
      accountId: args.inbound.accountId,
      conversationId: args.inbound.conversationId,
      replyToMessageId: args.inbound.id,
      role: 'ai',
      channel: args.inbound.channel,
      content: args.content,
      model: 'deterministic-reminder-response',
      provider: 'internal',
      tokensIn: 0,
      tokensOut: 0,
      cachedTokens: 0,
      aiCostMicrousd: 0,
    })
    .onConflictDoNothing()
    .returning({
      id: messages.id,
      conversationId: messages.conversationId,
      replyToMessageId: messages.replyToMessageId,
      content: messages.content,
      channel: messages.channel,
    });

  if (inserted?.replyToMessageId) return inserted as OutboundMessage;
  const existing = await findExistingReply(args.inbound, executor);
  if (existing) return existing;
  throw new Error('Reminder reply insert conflicted without an existing reply');
}

async function loadReminderCandidates(
  inbound: InboundMessage,
): Promise<ReminderCandidate[]> {
  return db
    .select({
      jobId: reminderJobs.id,
      appointmentId: appointments.id,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      sentAt: reminderJobs.sentAt,
      responseType: reminderJobs.responseType,
      responseMessageId: reminderJobs.responseMessageId,
      timezone: accounts.timezone,
      name: accounts.name,
    })
    .from(reminderJobs)
    .innerJoin(appointments, eq(reminderJobs.appointmentId, appointments.id))
    .innerJoin(messages, eq(reminderJobs.messageId, messages.id))
    .innerJoin(accounts, eq(appointments.accountId, accounts.id))
    .where(
      and(
        eq(reminderJobs.accountId, inbound.accountId),
        eq(reminderJobs.status, 'sent'),
        eq(appointments.accountId, inbound.accountId),
        eq(appointments.customerId, inbound.customerId),
        // Still actionable, or already acted on by this very message: a retry
        // that lost its reply has to resolve to the same candidate, and a
        // cancellation this message applied has left `cancelled` behind.
        or(
          inArray(appointments.status, ['pending', 'confirmed']),
          eq(reminderJobs.responseMessageId, inbound.id),
        ),
        eq(messages.conversationId, inbound.conversationId),
        // Bound on the inbound's own timestamp, not wall clock, so Inngest
        // retries of the same message resolve to the same candidate set.
        gt(appointments.endsAt, inbound.occurredAt),
        gte(
          reminderJobs.sentAt,
          subHours(inbound.occurredAt, REMINDER_RESPONSE_WINDOW_HOURS),
        ),
      ),
    )
    .orderBy(asc(appointments.startsAt), asc(reminderJobs.id));
}

async function recordReminderResponse(args: {
  candidate: ReminderCandidate;
  inbound: InboundMessage;
  responseType: ReminderResponseType | 'opt_out';
}): Promise<void> {
  await db
    .update(reminderJobs)
    .set({
      responseType: args.responseType,
      respondedAt: args.inbound.occurredAt,
      responseMessageId: args.inbound.id,
    })
    .where(
      and(
        eq(reminderJobs.id, args.candidate.jobId),
        or(
          isNull(reminderJobs.responseMessageId),
          eq(reminderJobs.responseMessageId, args.inbound.id),
          eq(reminderJobs.responseType, 'reschedule_requested'),
        ),
      ),
    );
}

function reminderTurnContext(
  reason: ReminderTurnContext['reason'],
  candidate?: ReminderCandidate,
): ReminderTurnContext {
  if (!candidate) return { reason };
  return {
    reason,
    appointmentId: candidate.appointmentId,
    appointmentStartsAt: candidate.startsAt.toISOString(),
    timezone: candidate.timezone,
    name: candidate.name,
  };
}

/**
 * How far ahead of this message to look for a newer opt-state instruction. A
 * conversation that ran on for this many messages has moved past the switch the
 * customer flipped, and the bound keeps the lookahead a constant-cost query.
 */
const OPT_STATE_LOOKAHEAD_MESSAGES = 20;

/**
 * Whether a newer customer message already asks for the opposite opt state.
 *
 * Inngest's per-conversation concurrency bounds parallelism but promises no
 * FIFO, so a rapid "NDAL" → "AKTIVIZO" pair can run in either order and the
 * older message would decide. The webhook commits every inbound before it
 * enqueues the job (app/api/webhooks/whatsapp/route.ts), so the messages carry
 * the true order: skipping the write when a newer instruction contradicts it
 * makes both runs converge on the newest message's state whichever way round
 * they execute. The newer message's own run still applies it.
 */
async function optStateSuperseded(args: {
  inbound: InboundMessage;
  intent: 'opt_out' | 'opt_in';
}): Promise<boolean> {
  const later = await db
    .select({ content: messages.content })
    .from(messages)
    .where(
      and(
        eq(messages.accountId, args.inbound.accountId),
        eq(messages.conversationId, args.inbound.conversationId),
        eq(messages.role, 'customer'),
        gt(messages.createdAt, args.inbound.occurredAt),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(OPT_STATE_LOOKAHEAD_MESSAGES);

  for (const message of later) {
    const intent = parseReplyIntent(message.content);
    if (intent === 'opt_out' || intent === 'opt_in') {
      return intent !== args.intent;
    }
  }
  return false;
}

async function setReminderOptOut(inbound: InboundMessage): Promise<void> {
  await db
    .update(customers)
    .set({
      reminderOptedOutAt: sql`COALESCE(${customers.reminderOptedOutAt}, now())`,
    })
    .where(
      and(eq(customers.id, inbound.customerId), eq(customers.accountId, inbound.accountId)),
    );
}

/**
 * Undo of {@link setReminderOptOut}, and the only one that exists: consent to
 * resume billed template messages has to come from the customer, so there is
 * deliberately no PT-side toggle. Gated on `IS NOT NULL` so an AKTIVIZO from a
 * customer who never opted out writes nothing; the boolean picks the reply.
 */
async function clearReminderOptOut(
  inbound: InboundMessage,
  executor: Executor = db,
): Promise<boolean> {
  const cleared = await executor
    .update(customers)
    .set({ reminderOptedOutAt: null })
    .where(
      and(
        eq(customers.id, inbound.customerId),
        eq(customers.accountId, inbound.accountId),
        isNotNull(customers.reminderOptedOutAt),
      ),
    )
    .returning({ id: customers.id });
  return cleared.length > 0;
}

async function handleConfirm(args: {
  inbound: InboundMessage;
  candidate: ReminderCandidate;
}): Promise<OutboundMessage> {
  await transitionAppointment({
    accountId: args.inbound.accountId,
    customerId: args.inbound.customerId,
    appointmentId: args.candidate.appointmentId,
    nextStatus: 'confirmed',
    origin: 'conversation',
  });
  await recordReminderResponse({
    candidate: args.candidate,
    inbound: args.inbound,
    responseType: 'confirm',
  });
  const time = formatAppointmentTime(
    args.candidate.startsAt,
    args.candidate.timezone,
  );
  return persistReminderReply({
    inbound: args.inbound,
    content: `Faleminderit. Takimi juaj për ${time} u konfirmua. Mirupafshim atëherë.`,
  });
}

async function handleCancel(args: {
  inbound: InboundMessage;
  candidate: ReminderCandidate;
}): Promise<OutboundMessage> {
  await cancelAppointment({
    accountId: args.inbound.accountId,
    customerId: args.inbound.customerId,
    appointmentId: args.candidate.appointmentId,
    cancelledBy: 'customer',
    reason: args.inbound.content,
    origin: 'conversation',
  });
  await recordReminderResponse({
    candidate: args.candidate,
    inbound: args.inbound,
    responseType: 'cancel',
  });
  const time = formatAppointmentTime(
    args.candidate.startsAt,
    args.candidate.timezone,
  );
  return persistReminderReply({
    inbound: args.inbound,
    content: `Takimi juaj për ${time} u anulua. Nëse dëshironi një orar tjetër, më dërgoni ditën ose orën që ju përshtatet.`,
  });
}

async function handleOptOut(args: {
  inbound: InboundMessage;
  candidate?: ReminderCandidate;
}): Promise<OutboundMessage> {
  if (
    !(await optStateSuperseded({ inbound: args.inbound, intent: 'opt_out' }))
  ) {
    await setReminderOptOut(args.inbound);
  }
  if (args.candidate) {
    await recordReminderResponse({
      candidate: args.candidate,
      inbound: args.inbound,
      responseType: 'opt_out',
    });
  }
  // The reply carries the way back on purpose: nothing else in the product tells
  // a customer how to restore reminders, and no PT-side toggle exists, so without
  // this sentence the opt-in path is unreachable.
  return persistReminderReply({
    inbound: args.inbound,
    content:
      'U çregjistruat nga kujtesat automatike të takimeve. Nëse doni t’i riaktivizoni më vonë, na shkruani AKTIVIZO. Mund të shkruani ende këtu për të rezervuar ose menaxhuar takimet.',
  });
}

async function handleOptIn(args: {
  inbound: InboundMessage;
}): Promise<OutboundMessage> {
  const superseded = await optStateSuperseded({
    inbound: args.inbound,
    intent: 'opt_in',
  });
  // One unit of work: a commit that cleared the opt-out but lost its reply
  // would leave the retry with nothing to restore, so the customer who just came
  // back would be told reminders were already on.
  return db.transaction(async (tx) => {
    const restored = superseded
      ? false
      : await clearReminderOptOut(args.inbound, tx);
    return persistReminderReply({
      inbound: args.inbound,
      executor: tx,
      content: restored
        ? 'Kujtesat automatike të takimeve u riaktivizuan. Do t’ju kujtojmë sërish takimet e ardhshme. Nëse doni t’i ndalni, na shkruani NDAL.'
        : 'Kujtesat automatike të takimeve janë tashmë aktive për ju. Nëse doni t’i ndalni, na shkruani NDAL.',
    });
  });
}

async function handleReschedule(args: {
  inbound: InboundMessage;
  candidate: ReminderCandidate;
  now: Date;
}): Promise<OutboundMessage> {
  await recordReminderResponse({
    candidate: args.candidate,
    inbound: args.inbound,
    responseType: 'reschedule_requested',
  });
  const availability = await getFreeSlotsInternal({
    accountId: args.inbound.accountId,
    start: args.now,
    end: addDays(args.now, 7),
    durationMinutes: Math.round(
      (args.candidate.endsAt.getTime() - args.candidate.startsAt.getTime()) /
        60_000,
    ),
    excludeAppointmentId: args.candidate.appointmentId,
  });
  const currentStart = args.candidate.startsAt.toISOString();
  const slots = availability.slots
    .filter((slot) => slot.startsAt !== currentStart)
    .slice(0, 5);

  const currentTime = formatAppointmentTime(
    args.candidate.startsAt,
    args.candidate.timezone,
  );
  const content =
    slots.length > 0
      ? `Pa problem. Mund t'ju ndihmoj ta ricaktoni takimin për ${currentTime}. Oraret e lira janë:\n${slots
          .map(
            (slot, index) =>
              `${index + 1}. ${formatAppointmentTime(new Date(slot.startsAt), args.candidate.timezone)}`,
          )
          .join('\n')}\nPërgjigjuni me alternativën që ju përshtatet.`
      : `Pa problem. Mund t'ju ndihmoj ta ricaktoni takimin për ${currentTime}, por nuk shoh orare të lira javën e ardhshme. Më dërgoni një ditë ose orë që ju përshtatet dhe do të kërkoj sërish.`;

  return persistReminderReply({ inbound: args.inbound, content });
}

function chooseCandidate(args: {
  inboundId: string;
  candidates: ReminderCandidate[];
}):
  | { kind: 'candidate'; candidate: ReminderCandidate }
  | { kind: 'fallback'; reminder: ReminderTurnContext }
  | { kind: 'none' } {
  const unresponded = args.candidates.filter(
    (candidate) =>
      (!candidate.responseMessageId && !candidate.responseType) ||
      // Answered by this same message: the transition committed and the reply
      // did not, so a retry must land on the candidate it already handled
      // instead of falling through to `none` and never answering the customer.
      candidate.responseMessageId === args.inboundId,
  );
  const rescheduleFollowups = args.candidates.filter(
    (candidate) => candidate.responseType === 'reschedule_requested',
  );
  const pool = unresponded.length > 0 ? unresponded : rescheduleFollowups;

  if (pool.length === 1) {
    return { kind: 'candidate', candidate: pool[0] };
  }
  if (pool.length > 1) {
    return {
      kind: 'fallback',
      reminder: reminderTurnContext('ambiguous_reminders'),
    };
  }
  return { kind: 'none' };
}

async function handleReminderResponseUnlocked(args: {
  inbound: InboundMessage;
  now: Date;
}): Promise<ReminderHandlingResult> {
  const existing = await findExistingReply(args.inbound);
  if (existing) return { kind: 'outbound', outbound: existing };

  const intent = parseReplyIntent(args.inbound.content);
  const candidates = await loadReminderCandidates(args.inbound);

  if (intent === 'opt_out') {
    const choice = chooseCandidate({ inboundId: args.inbound.id, candidates });
    return {
      kind: 'outbound',
      outbound: await handleOptOut({
        inbound: args.inbound,
        candidate: choice.kind === 'candidate' ? choice.candidate : undefined,
      }),
    };
  }

  // Symmetric to opt-out: it is about the customer, not about any one reminder,
  // so it resolves with no candidate. It is also not recorded on a reminder job
  // — `reminder_jobs.response_type` has no opt-in value, and an AKTIVIZO is not
  // an answer to the reminder, so the job stays unanswered for the PT.
  if (intent === 'opt_in') {
    return {
      kind: 'outbound',
      outbound: await handleOptIn({ inbound: args.inbound }),
    };
  }

  const choice = chooseCandidate({ inboundId: args.inbound.id, candidates });
  if (choice.kind === 'fallback') return choice;
  if (choice.kind === 'none') return { kind: 'none' };

  if (!intent) {
    return {
      kind: 'fallback',
      reminder: reminderTurnContext(
        choice.candidate.responseType === 'reschedule_requested'
          ? 'reschedule_followup'
          : 'unclear_reply',
        choice.candidate,
      ),
    };
  }

  if (intent === 'confirm') {
    return {
      kind: 'outbound',
      outbound: await handleConfirm({
        inbound: args.inbound,
        candidate: choice.candidate,
      }),
    };
  }
  if (intent === 'cancel') {
    return {
      kind: 'outbound',
      outbound: await handleCancel({
        inbound: args.inbound,
        candidate: choice.candidate,
      }),
    };
  }
  if (intent === 'reschedule') {
    return {
      kind: 'outbound',
      outbound: await handleReschedule({
        inbound: args.inbound,
        candidate: choice.candidate,
        now: args.now,
      }),
    };
  }

  return { kind: 'none' };
}

export async function handleReminderResponse(args: {
  inbound: InboundMessage;
  now?: Date;
}): Promise<ReminderHandlingResult> {
  return withAdvisoryLock(`reminder-response:${args.inbound.id}`, () =>
    handleReminderResponseUnlocked({
      inbound: args.inbound,
      now: args.now ?? new Date(),
    }),
  );
}
