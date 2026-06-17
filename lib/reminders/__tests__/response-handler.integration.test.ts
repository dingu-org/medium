import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';
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
import { createServiceClient } from '@/lib/supabase/service';
import { handleReminderResponse } from '../response-handler';

let ptId = '';
let patientId = '';
let conversationId = '';
let appointmentId = '';
let reminderMessageId = '';
let startsAt: Date;
let sequence = 0;

const now = new Date('2026-07-01T08:00:00.000Z');

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

async function inbound(content: string): Promise<InboundMessage> {
  const [message] = await db
    .insert(messages)
    .values({
      ptId,
      conversationId,
      externalId: `wamid.IN.${Date.now()}.${++sequence}`,
      role: 'patient',
      channel: 'whatsapp',
      content,
      createdAt: now,
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
    occurredAt: now,
  };
}

describe('handleReminderResponse', () => {
  it('confirms an appointment and records the response idempotently', async () => {
    const inboundMessage = await inbound('CONFIRM');

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
  });

  it('cancels with patient metadata and avoids duplicate replies', async () => {
    const inboundMessage = await inbound('CANCEL');

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

  it('offers real available slots for a reschedule request', async () => {
    await db.insert(availabilityRules).values(
      [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
        ptId,
        weekday,
        startTime: '09:00:00',
        endTime: '12:00:00',
      })),
    );
    const inboundMessage = await inbound('RESCHEDULE');

    const result = await handleReminderResponse({ inbound: inboundMessage, now });

    expect(result.kind).toBe('outbound');
    if (result.kind !== 'outbound') return;
    expect(result.outbound.content).toContain('Available times:');
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
    const inboundMessage = await inbound('yes');

    const result = await handleReminderResponse({ inbound: inboundMessage, now });

    expect(result.kind).toBe('outbound');
    const [appointment] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, appointmentId));
    expect(appointment.status).toBe('confirmed');
  });

  it('falls back to reminder-aware AI for unclear replies', async () => {
    const inboundMessage = await inbound('maybe');

    const result = await handleReminderResponse({ inbound: inboundMessage, now });

    expect(result).toEqual({
      kind: 'fallback',
      reminder: expect.objectContaining({
        reason: 'unclear_reply',
        appointmentId,
      }),
    });
  });
});
