import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Only the Graph calls are stubbed; the guards under test are DB reads. The
// module is mocked whole, so the exports the reminder module's own imports pull
// in (bootstrap templates) have to be present too.
const { mockSendTemplate } = vi.hoisted(() => ({
  mockSendTemplate: vi.fn(),
}));
vi.mock('@/lib/channels/whatsapp/client', () => ({
  sendTemplate: mockSendTemplate,
  submitTemplate: vi.fn(),
  getTemplateStatus: vi.fn(),
}));
vi.mock('@/lib/events/outbox', () => ({
  tryPublishOutboxEvent: vi.fn(async () => {}),
}));

import { addHours, subHours } from 'date-fns';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  conversations,
  eventOutbox,
  events,
  messages,
  customers,
  reminderJobs,
} from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import {
  recordReminderFailure,
  sendReminderTemplateOnce,
  upsertReminderSchedule,
} from '../send-reminder';

let accountId = '';
let customerId = '';
let conversationId = '';
let appointmentId = '';
let startsAt: Date;

async function seedReminderMessage(externalId: string | null): Promise<string> {
  const [message] = await db
    .insert(messages)
    .values({
      accountId,
      conversationId,
      externalId,
      role: 'ai',
      channel: 'whatsapp',
      content: 'Kujtesë',
      model: 'deterministic-reminder',
      provider: 'internal',
    })
    .returning({ id: messages.id });
  return message.id;
}

function sendArgs(messageId: string) {
  return {
    messageId,
    connectionId: 'conn-1',
    recipient: '447700900101',
    templateName: 'appointment_reminder',
    language: 'sq',
    variables: ['Alex', 'Move Well', 'e hënë 10:00'],
  };
}

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `send-reminder-${Date.now()}@example.com`,
    password: 'send-reminder-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  accountId = data.user.id;
});

beforeEach(async () => {
  mockSendTemplate.mockReset();
  await db.delete(eventOutbox).where(eq(eventOutbox.accountId, accountId));
  await db.delete(events).where(eq(events.accountId, accountId));
  await db.delete(customers).where(eq(customers.accountId, accountId));

  const stamp = `${Date.now()}`;
  const [customer] = await db
    .insert(customers)
    .values({ accountId, name: 'Alex', phone: `4477009${stamp.slice(-5)}` })
    .returning({ id: customers.id });
  customerId = customer.id;
  const [conversation] = await db
    .insert(conversations)
    .values({ accountId, customerId, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  conversationId = conversation.id;
  startsAt = addHours(new Date(), 48);
  const [appointment] = await db
    .insert(appointments)
    .values({
      accountId,
      customerId,
      startsAt,
      endsAt: addHours(startsAt, 1),
      status: 'pending',
    })
    .returning({ id: appointments.id });
  appointmentId = appointment.id;
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

describe('sendReminderTemplateOnce', () => {
  it('does not re-send a template whose wamid is already on the message', async () => {
    // The memoized prepare step of a second run for the same appointment still
    // says `external_id: null` long after the first run sent — trusting it
    // meant two identical templates, two Meta charges, and only the last wamid
    // on the row (so the first delivery's callbacks matched no reminder job).
    const messageId = await seedReminderMessage('wamid.ALREADY_SENT');

    await expect(sendReminderTemplateOnce(sendArgs(messageId))).resolves.toBe(
      'wamid.ALREADY_SENT',
    );
    expect(mockSendTemplate).not.toHaveBeenCalled();
  });

  it('sends and returns the new wamid when nothing was sent yet', async () => {
    const messageId = await seedReminderMessage(null);
    mockSendTemplate.mockResolvedValue({ messageId: 'wamid.FRESH' });

    await expect(sendReminderTemplateOnce(sendArgs(messageId))).resolves.toBe(
      'wamid.FRESH',
    );
    expect(mockSendTemplate).toHaveBeenCalledTimes(1);
  });

  it('throws when WhatsApp accepts the send without a message id', async () => {
    const messageId = await seedReminderMessage(null);
    mockSendTemplate.mockResolvedValue({ messageId: null });

    await expect(
      sendReminderTemplateOnce(sendArgs(messageId)),
    ).rejects.toThrow('without returning a message ID');
  });
});

describe('recordReminderFailure run ownership', () => {
  it('does not fail (or announce) a cycle a newer run already re-armed', async () => {
    await upsertReminderSchedule({
      accountId,
      appointmentId,
      scheduledFor: subHours(startsAt, 24),
      runId: 'run-live',
    });

    await recordReminderFailure({
      accountId,
      appointmentId,
      scheduledFor: subHours(startsAt, 24),
      runId: 'run-stale',
      error: 'Error: Graph 500',
    });

    const [job] = await db
      .select()
      .from(reminderJobs)
      .where(eq(reminderJobs.appointmentId, appointmentId));
    expect(job.status).toBe('scheduled');
    expect(job.inngestRunId).toBe('run-live');
    const failures = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.accountId, accountId), eq(events.type, 'reminder.failed')));
    expect(failures).toHaveLength(0);
  });

  it('records the failure of the run that owns the row', async () => {
    await upsertReminderSchedule({
      accountId,
      appointmentId,
      scheduledFor: subHours(startsAt, 24),
      runId: 'run-live',
    });

    await recordReminderFailure({
      accountId,
      appointmentId,
      scheduledFor: subHours(startsAt, 24),
      runId: 'run-live',
      error: 'Error: Graph 500',
    });

    const [job] = await db
      .select({ status: reminderJobs.status })
      .from(reminderJobs)
      .where(eq(reminderJobs.appointmentId, appointmentId));
    expect(job.status).toBe('failed');
    const failures = await db
      .select({ payload: events.payload })
      .from(events)
      .where(and(eq(events.accountId, accountId), eq(events.type, 'reminder.failed')));
    expect(failures).toHaveLength(1);
    expect(failures[0].payload).toMatchObject({ appointmentId });
  });
});
