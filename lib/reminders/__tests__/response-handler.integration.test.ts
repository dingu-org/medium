import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addHours, subHours } from 'date-fns';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  availabilityRules,
  conversations,
  messages,
  patients,
  pts,
  reminderJobs,
} from '@/lib/db/schema';
import type { InboundMessage } from '@/lib/conversation/types';
import { formatAppointmentTime } from '@/lib/format/appointment-time';
import { createServiceClient } from '@/lib/supabase/service';
import { handleReminderResponse } from '../response-handler';
import { testNowUtc } from '@/tests/support/clock';

let ptId = '';
let patientId = '';
let conversationId = '';
let appointmentId = '';
let reminderMessageId = '';
let startsAt: Date;
let sequence = 0;

// Derived: the reminder cycle only cares about distances from `now`.
const now = testNowUtc();

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `reminder-response-${Date.now()}@example.com`,
    password: 'reminder-response-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
});

beforeEach(async () => {
  await db.delete(patients).where(eq(patients.ptId, ptId));
  await db.delete(availabilityRules).where(eq(availabilityRules.ptId, ptId));
  await db
    .update(pts)
    .set({ timezone: 'Europe/Tirane', practiceName: 'Move Well' })
    .where(eq(pts.id, ptId));

  const [patient] = await db
    .insert(patients)
    .values({
      ptId,
      name: 'Alex Patient',
      phone: `4477009${Date.now()}${++sequence}`,
      waId: `4477009${Date.now()}${sequence}`,
    })
    .returning({ id: patients.id });
  patientId = patient.id;

  const [conversation] = await db
    .insert(conversations)
    .values({
      ptId,
      patientId,
      channel: 'whatsapp',
      lastInboundAt: now,
    })
    .returning({ id: conversations.id });
  conversationId = conversation.id;

  startsAt = addHours(now, 30);
  const [appointment] = await db
    .insert(appointments)
    .values({
      ptId,
      patientId,
      startsAt,
      endsAt: addHours(startsAt, 1),
      status: 'pending',
      serviceType: 'Treatment',
    })
    .returning({ id: appointments.id });
  appointmentId = appointment.id;

  const [reminderMessage] = await db
    .insert(messages)
    .values({
      ptId,
      conversationId,
      externalId: `wamid.REMINDER.${Date.now()}.${sequence}`,
      role: 'ai',
      channel: 'whatsapp',
      content: 'Reminder',
      model: 'deterministic-reminder',
      provider: 'internal',
    })
    .returning({ id: messages.id });
  reminderMessageId = reminderMessage.id;

  await db.insert(reminderJobs).values({
    ptId,
    appointmentId,
    scheduledFor: subHours(startsAt, 24),
    inngestRunId: `run-${sequence}`,
    status: 'sent',
    sentAt: now,
    messageId: reminderMessageId,
  });
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

async function inbound(
  content: string,
  occurredAt: Date = now,
): Promise<InboundMessage> {
  const [message] = await db
    .insert(messages)
    .values({
      ptId,
      conversationId,
      externalId: `wamid.IN.${Date.now()}.${++sequence}`,
      role: 'patient',
      channel: 'whatsapp',
      content,
      createdAt: occurredAt,
    })
    .returning({ id: messages.id });
  return {
    id: message.id,
    conversationId,
    ptId,
    patientId,
    content,
    channel: 'whatsapp',
    externalId: null,
    occurredAt,
  };
}

/** The crash window R10 is about: the mutation committed, the reply did not. */
async function dropReply(inboundMessage: InboundMessage): Promise<void> {
  await db
    .delete(messages)
    .where(eq(messages.replyToMessageId, inboundMessage.id));
}

describe('handleReminderResponse', () => {
  it('confirms an appointment and records the response idempotently', async () => {
    const inboundMessage = await inbound('KONFIRMO');

    const first = await handleReminderResponse({
      inbound: inboundMessage,
      now,
    });
    const replay = await handleReminderResponse({
      inbound: inboundMessage,
      now,
    });

    expect(first.kind).toBe('outbound');
    expect(replay.kind).toBe('outbound');

    const [appointment] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, appointmentId));
    const [job] = await db
      .select()
      .from(reminderJobs)
      .where(eq(reminderJobs.appointmentId, appointmentId));
    const replies = await db
      .select()
      .from(messages)
      .where(eq(messages.replyToMessageId, inboundMessage.id));

    expect(appointment.status).toBe('confirmed');
    expect(job.responseType).toBe('confirm');
    expect(job.responseMessageId).toBe(inboundMessage.id);
    expect(replies).toHaveLength(1);
    // One renderer for every patient-facing appointment time: the reminder that
    // asked the question and this answer have to name the same instant the same
    // way.
    if (first.kind !== 'outbound') return;
    expect(first.outbound.content).toContain(
      formatAppointmentTime(startsAt, 'Europe/Tirane'),
    );
  });

  // A retry after the transition committed but the reply did not: without it the
  // candidate query no longer matches and the patient is never answered.
  it('re-answers a confirmation whose reply was lost after the transition', async () => {
    const inboundMessage = await inbound('KONFIRMO');
    await handleReminderResponse({ inbound: inboundMessage, now });
    await dropReply(inboundMessage);

    const retry = await handleReminderResponse({
      inbound: inboundMessage,
      now,
    });

    expect(retry.kind).toBe('outbound');
    const [appointment] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, appointmentId));
    expect(appointment.status).toBe('confirmed');
    const replies = await db
      .select()
      .from(messages)
      .where(eq(messages.replyToMessageId, inboundMessage.id));
    expect(replies).toHaveLength(1);
  });

  it('re-answers a cancellation whose reply was lost after the transition', async () => {
    const inboundMessage = await inbound('ANULO');
    await handleReminderResponse({ inbound: inboundMessage, now });
    await dropReply(inboundMessage);

    const retry = await handleReminderResponse({
      inbound: inboundMessage,
      now,
    });

    expect(retry.kind).toBe('outbound');
    if (retry.kind !== 'outbound') return;
    expect(retry.outbound.content).toContain('u anulua');
    const [appointment] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, appointmentId));
    expect(appointment.status).toBe('cancelled');
    expect(appointment.cancelledBy).toBe('patient');
  });

  it('cancels with patient metadata and avoids duplicate replies', async () => {
    const inboundMessage = await inbound('ANULO');

    await handleReminderResponse({ inbound: inboundMessage, now });
    await handleReminderResponse({ inbound: inboundMessage, now });

    const [appointment] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, appointmentId));
    const [job] = await db
      .select()
      .from(reminderJobs)
      .where(eq(reminderJobs.appointmentId, appointmentId));
    const replies = await db
      .select()
      .from(messages)
      .where(eq(messages.replyToMessageId, inboundMessage.id));

    expect(appointment.status).toBe('cancelled');
    expect(appointment.cancelledBy).toBe('patient');
    expect(job.responseType).toBe('cancel');
    expect(replies).toHaveLength(1);
  });

  it('opts the patient out of future reminders', async () => {
    const inboundMessage = await inbound('STOP');

    await handleReminderResponse({ inbound: inboundMessage, now });

    const [patient] = await db
      .select()
      .from(patients)
      .where(eq(patients.id, patientId));
    const [job] = await db
      .select()
      .from(reminderJobs)
      .where(eq(reminderJobs.appointmentId, appointmentId));
    expect(patient.reminderOptedOutAt).not.toBeNull();
    expect(job.responseType).toBe('opt_out');
  });

  it('lets the patient opt back in after NDAL and tells them how', async () => {
    const optOut = await inbound('NDAL');
    const optOutResult = await handleReminderResponse({ inbound: optOut, now });

    expect(optOutResult.kind).toBe('outbound');
    if (optOutResult.kind !== 'outbound') return;
    // Without this sentence the way back is unreachable: there is no PT-side
    // toggle, by design.
    expect(optOutResult.outbound.content).toContain('AKTIVIZO');

    const [optedOut] = await db
      .select()
      .from(patients)
      .where(eq(patients.id, patientId));
    expect(optedOut.reminderOptedOutAt).not.toBeNull();

    const optIn = await inbound('AKTIVIZO');
    const optInResult = await handleReminderResponse({ inbound: optIn, now });

    expect(optInResult.kind).toBe('outbound');
    const [optedIn] = await db
      .select()
      .from(patients)
      .where(eq(patients.id, patientId));
    expect(optedIn.reminderOptedOutAt).toBeNull();

    // The opt-in is about the patient, not about the reminder, so the job keeps
    // the opt-out it recorded and stays out of the unanswered list.
    const [job] = await db
      .select()
      .from(reminderJobs)
      .where(eq(reminderJobs.appointmentId, appointmentId));
    expect(job.responseType).toBe('opt_out');
  });

  it('answers AKTIVIZO from a patient who never opted out without writing', async () => {
    const inboundMessage = await inbound('AKTIVIZO');

    const result = await handleReminderResponse({
      inbound: inboundMessage,
      now,
    });

    expect(result.kind).toBe('outbound');
    if (result.kind !== 'outbound') return;
    expect(result.outbound.content).toContain('NDAL');

    const [patient] = await db
      .select()
      .from(patients)
      .where(eq(patients.id, patientId));
    expect(patient.reminderOptedOutAt).toBeNull();

    // Replays reuse the stored reply rather than inserting a second one.
    await handleReminderResponse({ inbound: inboundMessage, now });
    const replies = await db
      .select()
      .from(messages)
      .where(eq(messages.replyToMessageId, inboundMessage.id));
    expect(replies).toHaveLength(1);
  });

  // Inngest bounds per-conversation parallelism but promises no FIFO, so the
  // older message can reach the handler last. The patient's newest instruction
  // has to win either way — otherwise a patient who opted back in stays silent
  // forever because the stale NDAL ran second.
  it('keeps a newer AKTIVIZO from being undone by an NDAL handled after it', async () => {
    const optOut = await inbound('NDAL');
    await inbound('AKTIVIZO', addHours(now, 1));

    const result = await handleReminderResponse({ inbound: optOut, now });

    expect(result.kind).toBe('outbound');
    const [patient] = await db
      .select()
      .from(patients)
      .where(eq(patients.id, patientId));
    expect(patient.reminderOptedOutAt).toBeNull();
  });

  it('keeps a newer NDAL from being undone by an AKTIVIZO handled after it', async () => {
    await db
      .update(patients)
      .set({ reminderOptedOutAt: subHours(now, 1) })
      .where(eq(patients.id, patientId));
    const optIn = await inbound('AKTIVIZO');
    await inbound('NDAL', addHours(now, 1));

    await handleReminderResponse({ inbound: optIn, now });

    const [patient] = await db
      .select()
      .from(patients)
      .where(eq(patients.id, patientId));
    expect(patient.reminderOptedOutAt).not.toBeNull();
  });

  it('offers real available slots for a reschedule request', async () => {
    await db.insert(availabilityRules).values(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        ptId,
        weekday,
        startTime: '09:00:00',
        endTime: '12:00:00',
      })),
    );
    const inboundMessage = await inbound('RICAKTO');

    const result = await handleReminderResponse({
      inbound: inboundMessage,
      now,
    });

    expect(result.kind).toBe('outbound');
    if (result.kind !== 'outbound') return;
    expect(result.outbound.content).toContain('Oraret e lira janë:');
    expect(result.outbound.content).toContain('1.');

    const [job] = await db
      .select()
      .from(reminderJobs)
      .where(eq(reminderJobs.appointmentId, appointmentId));
    expect(job.responseType).toBe('reschedule_requested');
  });

  it('handles reminders even when AI is inactive', async () => {
    await db
      .update(conversations)
      .set({ aiActive: false })
      .where(eq(conversations.id, conversationId));
    const inboundMessage = await inbound('Po');

    const result = await handleReminderResponse({
      inbound: inboundMessage,
      now,
    });

    expect(result.kind).toBe('outbound');
    const [appointment] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, appointmentId));
    expect(appointment.status).toBe('confirmed');
  });

  it('ignores a stale reminder for an appointment that has already passed', async () => {
    const pastStart = subHours(now, 21 * 24);
    await db
      .update(appointments)
      .set({ startsAt: pastStart, endsAt: addHours(pastStart, 1) })
      .where(eq(appointments.id, appointmentId));
    await db
      .update(reminderJobs)
      .set({
        scheduledFor: subHours(pastStart, 24),
        sentAt: subHours(pastStart, 24),
      })
      .where(eq(reminderJobs.appointmentId, appointmentId));
    const inboundMessage = await inbound('Ok');

    const result = await handleReminderResponse({
      inbound: inboundMessage,
      now,
    });

    expect(result).toEqual({ kind: 'none' });
    const [appointment] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, appointmentId));
    expect(appointment.status).toBe('pending');
  });

  it('ignores a reminder sent long before the reply arrived', async () => {
    await db
      .update(reminderJobs)
      .set({ sentAt: subHours(now, 72) })
      .where(eq(reminderJobs.appointmentId, appointmentId));
    const inboundMessage = await inbound('Ok');

    const result = await handleReminderResponse({
      inbound: inboundMessage,
      now,
    });

    expect(result).toEqual({ kind: 'none' });
  });

  it('falls back to reminder-aware AI for unclear replies', async () => {
    const inboundMessage = await inbound('maybe');

    const result = await handleReminderResponse({
      inbound: inboundMessage,
      now,
    });

    expect(result).toEqual({
      kind: 'fallback',
      reminder: expect.objectContaining({
        reason: 'unclear_reply',
        appointmentId,
      }),
    });
  });
});
