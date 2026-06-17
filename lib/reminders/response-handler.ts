import { addDays } from 'date-fns';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { withAdvisoryLock } from '@/lib/db/advisory-lock';
import { db } from '@/lib/db';
import {
  appointments,
  messages,
  patients,
  pts,
  reminderJobs,
} from '@/lib/db/schema';
import { getFreeSlotsInternal } from '@/lib/appointments/availability';
import { cancelAppointment } from '@/lib/appointments/cancel';
import { transitionAppointment } from '@/lib/appointments/state';
import type {
  InboundMessage,
  OutboundMessage,
  ReminderTurnContext,
} from '@/lib/conversation/types';
import {
  parseReminderResponse,
  type ReminderResponseIntent,
} from './parse-response';

type ReminderResponseType = 'confirm' | 'cancel' | 'reschedule_requested';

type ReminderCandidate = {
  jobId: string;
  appointmentId: string;
  startsAt: Date;
  endsAt: Date;
  serviceType: string | null;
  responseType: 'confirm' | 'cancel' | 'reschedule_requested' | 'opt_out' | null;
  responseMessageId: string | null;
  timezone: string;
  practiceName: string | null;
};

export type ReminderHandlingResult =
  | { kind: 'none' }
  | { kind: 'outbound'; outbound: OutboundMessage }
  | { kind: 'fallback'; reminder: ReminderTurnContext };

function formatAppointmentTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

async function findExistingReply(
  inbound: InboundMessage,
): Promise<OutboundMessage | null> {
  const [existing] = await db
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

async function persistReminderReply(args: {
  inbound: InboundMessage;
  content: string;
}): Promise<OutboundMessage> {
  const [inserted] = await db
    .insert(messages)
    .values({
      ptId: args.inbound.ptId,
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
  const existing = await findExistingReply(args.inbound);
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
      serviceType: appointments.serviceType,
      responseType: reminderJobs.responseType,
      responseMessageId: reminderJobs.responseMessageId,
      timezone: pts.timezone,
      practiceName: pts.practiceName,
    })
    .from(reminderJobs)
    .innerJoin(appointments, eq(reminderJobs.appointmentId, appointments.id))
    .innerJoin(messages, eq(reminderJobs.messageId, messages.id))
    .innerJoin(pts, eq(appointments.ptId, pts.id))
    .where(
      and(
        eq(reminderJobs.ptId, inbound.ptId),
        eq(reminderJobs.status, 'sent'),
        eq(appointments.ptId, inbound.ptId),
        eq(appointments.patientId, inbound.patientId),
        inArray(appointments.status, ['pending', 'confirmed']),
        eq(messages.conversationId, inbound.conversationId),
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
    practiceName: candidate.practiceName,
  };
}

async function setReminderOptOut(inbound: InboundMessage): Promise<void> {
  await db
    .update(patients)
    .set({ reminderOptedOutAt: sql`COALESCE(${patients.reminderOptedOutAt}, now())` })
    .where(and(eq(patients.id, inbound.patientId), eq(patients.ptId, inbound.ptId)));
}

async function handleConfirm(args: {
  inbound: InboundMessage;
  candidate: ReminderCandidate;
}): Promise<OutboundMessage> {
  await transitionAppointment({
    ptId: args.inbound.ptId,
    patientId: args.inbound.patientId,
    appointmentId: args.candidate.appointmentId,
    nextStatus: 'confirmed',
  });
  await recordReminderResponse({
    candidate: args.candidate,
    inbound: args.inbound,
    responseType: 'confirm',
  });
  const time = formatAppointmentTime(args.candidate.startsAt, args.candidate.timezone);
  return persistReminderReply({
    inbound: args.inbound,
    content: `Thanks, your appointment for ${time} is confirmed. See you then.`,
  });
}

async function handleCancel(args: {
  inbound: InboundMessage;
  candidate: ReminderCandidate;
}): Promise<OutboundMessage> {
  await cancelAppointment({
    ptId: args.inbound.ptId,
    patientId: args.inbound.patientId,
    appointmentId: args.candidate.appointmentId,
    cancelledBy: 'patient',
    reason: args.inbound.content,
  });
  await recordReminderResponse({
    candidate: args.candidate,
    inbound: args.inbound,
    responseType: 'cancel',
  });
  const time = formatAppointmentTime(args.candidate.startsAt, args.candidate.timezone);
  return persistReminderReply({
    inbound: args.inbound,
    content: `Your appointment for ${time} has been cancelled. If you would like to book a different time, send me the day or time that works for you.`,
  });
}

async function handleOptOut(args: {
  inbound: InboundMessage;
  candidate?: ReminderCandidate;
}): Promise<OutboundMessage> {
  await setReminderOptOut(args.inbound);
  if (args.candidate) {
    await recordReminderResponse({
      candidate: args.candidate,
      inbound: args.inbound,
      responseType: 'opt_out',
    });
  }
  return persistReminderReply({
    inbound: args.inbound,
    content:
      'You have been opted out of automated appointment reminders. You can still message here to book or manage appointments.',
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
    ptId: args.inbound.ptId,
    start: args.now,
    end: addDays(args.now, 7),
    durationMinutes: 60,
    serviceType: args.candidate.serviceType ?? undefined,
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
      ? `No problem. I can help reschedule your appointment for ${currentTime}. Available times:\n${slots
          .map(
            (slot, index) =>
              `${index + 1}. ${formatAppointmentTime(new Date(slot.startsAt), args.candidate.timezone)}`,
          )
          .join('\n')}\nReply with the option that works for you.`
      : `No problem. I can help reschedule your appointment for ${currentTime}, but I do not see any available times in the next week. Send me a day or time that works for you, and I will keep looking.`;

  return persistReminderReply({ inbound: args.inbound, content });
}

function chooseCandidate(args: {
  intent: ReminderResponseIntent | null;
  candidates: ReminderCandidate[];
}):
  | { kind: 'candidate'; candidate: ReminderCandidate }
  | { kind: 'fallback'; reminder: ReminderTurnContext }
  | { kind: 'none' } {
  const unresponded = args.candidates.filter(
    (candidate) => !candidate.responseMessageId && !candidate.responseType,
  );
  const rescheduleFollowups = args.candidates.filter(
    (candidate) => candidate.responseType === 'reschedule_requested',
  );
  const pool = unresponded.length > 0 ? unresponded : rescheduleFollowups;

  if (pool.length === 1) {
    const reason =
      pool[0].responseType === 'reschedule_requested'
        ? 'reschedule_followup'
        : 'unclear_reply';
    return {
      kind: 'candidate',
      candidate: pool[0],
      ...(args.intent
        ? {}
        : { reminder: reminderTurnContext(reason, pool[0]) }),
    };
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

  const intent = parseReminderResponse(args.inbound.content);
  const candidates = await loadReminderCandidates(args.inbound);

  if (intent === 'opt_out') {
    const choice = chooseCandidate({ intent, candidates });
    return {
      kind: 'outbound',
      outbound: await handleOptOut({
        inbound: args.inbound,
        candidate: choice.kind === 'candidate' ? choice.candidate : undefined,
      }),
    };
  }

  const choice = chooseCandidate({ intent, candidates });
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
