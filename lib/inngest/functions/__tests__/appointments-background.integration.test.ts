import { randomUUID } from 'node:crypto';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { addHours, addMinutes, subHours } from 'date-fns';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  conversations,
  messageTemplates,
  messages,
  patients,
  pts,
  reminderJobs,
  whatsappConnections,
} from '@/lib/db/schema';
import { encryptToken } from '@/lib/db/crypto';
import { createServiceClient } from '@/lib/supabase/service';
import {
  ENGLISH_REMINDER_TEMPLATE,
  FALLBACK_REMINDER_TEMPLATE,
  LEGACY_REMINDER_TEMPLATE,
  REMINDER_TEMPLATE,
} from '../bootstrap-wa-connection';
import {
  persistAppointmentConfirmation,
  prepareAppointmentConfirmation,
  sendAppointmentConfirmation,
} from '../appointment-events';
import {
  computeReminderSchedule,
  loadReminderAttempt,
  upsertReminderSchedule,
} from '../send-reminder';

let ptId = '';
let patientId = '';
let conversationId = '';
let appointmentId = '';
let connectionId = '';
let startsAt: Date;
let sequence = 0;

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `appointment-jobs-${Date.now()}@example.com`,
    password: 'appointment-jobs-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
});

beforeEach(async () => {
  await db.delete(messageTemplates).where(eq(messageTemplates.ptId, ptId));
  await db
    .delete(whatsappConnections)
    .where(eq(whatsappConnections.ptId, ptId));
  await db.delete(patients).where(eq(patients.ptId, ptId));
  await db
    .update(pts)
    .set({ timezone: 'Europe/Tirane', practiceName: 'Move Well' })
    .where(eq(pts.id, ptId));

  const [connection] = await db
    .insert(whatsappConnections)
    .values({
      ptId,
      phoneNumberId: `PNI_APPT_JOB_${Date.now()}_${++sequence}`,
      wabaId: 'WABA_APPT_JOB',
      accessTokenEncrypted: await encryptToken('APPT_JOB_TOKEN'),
      status: 'active',
      tier: 'TIER_250',
    })
    .returning({ id: whatsappConnections.id });
  connectionId = connection.id;

  const [patient] = await db
    .insert(patients)
    .values({
      ptId,
      name: 'Alex Patient',
      phone: '447700900101',
      waId: '447700900101',
    })
    .returning({ id: patients.id });
  patientId = patient.id;

  const [conversation] = await db
    .insert(conversations)
    .values({
      ptId,
      patientId,
      channel: 'whatsapp',
      lastInboundAt: new Date(),
    })
    .returning({ id: conversations.id });
  conversationId = conversation.id;

  startsAt = addHours(new Date(), 48);
  const [appointment] = await db
    .insert(appointments)
    .values({
      ptId,
      patientId,
      startsAt,
      endsAt: addHours(startsAt, 1),
      status: 'pending',
    })
    .returning({ id: appointments.id });
  appointmentId = appointment.id;
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

describe('appointment event confirmation', () => {
  it('uses the domain event ID to persist and deliver only once', async () => {
    const sourceEventId = randomUUID();
    const first = await prepareAppointmentConfirmation({
      sourceEventId,
      kind: 'appointment.booked',
      ptId,
      appointmentId,
      startsAt,
    });
    const second = await prepareAppointmentConfirmation({
      sourceEventId,
      kind: 'appointment.booked',
      ptId,
      appointmentId,
      startsAt,
    });
    expect(first.kind).toBe('ready');
    expect(second.kind).toBe('ready');
    if (first.kind !== 'ready' || second.kind !== 'ready') return;
    expect(second.messageId).toBe(first.messageId);
    expect(first.content).toContain('Takimi juaj u rezervua');

    const sendFn = vi.fn(async () => ({ messageId: 'wamid.EVENT' }));
    const delivery = await sendAppointmentConfirmation({
      ...first,
      sendFn,
    });
    await persistAppointmentConfirmation({
      messageId: first.messageId,
      externalId: delivery.externalId,
    });
    const replay = await sendAppointmentConfirmation({
      ...second,
      externalId: delivery.externalId,
      sendFn,
    });

    expect(replay.replay).toBe(true);
    expect(sendFn).toHaveBeenCalledTimes(1);
    const stored = await db
      .select()
      .from(messages)
      .where(eq(messages.sourceEventId, sourceEventId));
    expect(stored).toHaveLength(1);
    expect(stored[0].externalId).toBe('wamid.EVENT');
  });
});

describe('reminder scheduling and guards', () => {
  it('schedules 24 hours before, delays short-notice reminders, and skips under two hours', () => {
    const now = new Date('2026-07-01T10:00:00.000Z');
    expect(computeReminderSchedule(addHours(now, 48), now)).toEqual({
      kind: 'scheduled',
      scheduledFor: addHours(now, 24),
    });
    expect(computeReminderSchedule(addHours(now, 12), now)).toEqual({
      kind: 'scheduled',
      scheduledFor: addMinutes(now, 5),
    });
    expect(computeReminderSchedule(addMinutes(now, 119), now)).toEqual({
      kind: 'skipped',
      reason: 'short_notice',
    });
  });

  it('keeps one durable schedule per appointment across reschedules', async () => {
    const firstSchedule = subHours(startsAt, 24);
    await upsertReminderSchedule({
      ptId,
      appointmentId,
      scheduledFor: firstSchedule,
      runId: 'run-first',
    });
    const nextSchedule = addHours(firstSchedule, 2);
    await upsertReminderSchedule({
      ptId,
      appointmentId,
      scheduledFor: nextSchedule,
      runId: 'run-next',
    });

    const rows = await db
      .select()
      .from(reminderJobs)
      .where(eq(reminderJobs.appointmentId, appointmentId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      inngestRunId: 'run-next',
      status: 'scheduled',
    });
    expect(rows[0].scheduledFor).toEqual(nextSchedule);
  });

  it('requeues for an unapproved template, becomes ready after approval, and rejects stale runs', async () => {
    const scheduledFor = subHours(startsAt, 24);
    await upsertReminderSchedule({
      ptId,
      appointmentId,
      scheduledFor,
      runId: 'run-current',
    });
    const [template] = await db
      .insert(messageTemplates)
      .values({
        ptId,
        name: REMINDER_TEMPLATE.name,
        language: REMINDER_TEMPLATE.language,
        status: 'pending',
        body: REMINDER_TEMPLATE.body,
      })
      .returning({ id: messageTemplates.id });

    await expect(
      loadReminderAttempt({
        ptId,
        appointmentId,
        runId: 'run-current',
        scheduledFor,
      }),
    ).resolves.toEqual({
      kind: 'retry',
      reason: 'template_not_approved',
    });

    await db.insert(messageTemplates).values({
      ptId,
      name: ENGLISH_REMINDER_TEMPLATE.name,
      language: ENGLISH_REMINDER_TEMPLATE.language,
      status: 'approved',
      body: ENGLISH_REMINDER_TEMPLATE.body,
    });
    const englishFallback = await loadReminderAttempt({
      ptId,
      appointmentId,
      runId: 'run-current',
      scheduledFor,
    });
    expect(englishFallback.kind).toBe('ready');
    if (englishFallback.kind === 'ready') {
      expect(englishFallback.template.name).toBe(
        ENGLISH_REMINDER_TEMPLATE.name,
      );
    }

    await db
      .update(messageTemplates)
      .set({ status: 'approved' })
      .where(eq(messageTemplates.id, template.id));
    const ready = await loadReminderAttempt({
      ptId,
      appointmentId,
      runId: 'run-current',
      scheduledFor,
    });
    expect(ready.kind).toBe('ready');
    if (ready.kind === 'ready') {
      expect(ready.context).toMatchObject({
        appointmentId,
        patientId,
        conversationId,
        connectionId,
      });
      expect(ready.template.name).toBe(REMINDER_TEMPLATE.name);
    }

    await expect(
      loadReminderAttempt({
        ptId,
        appointmentId,
        runId: 'run-stale',
        scheduledFor,
      }),
    ).resolves.toEqual({ kind: 'skipped', reason: 'stale_run' });
  });

  it('chooses approved templates in v2, fallback, legacy order', async () => {
    const scheduledFor = subHours(startsAt, 24);
    await upsertReminderSchedule({
      ptId,
      appointmentId,
      scheduledFor,
      runId: 'run-template-priority',
    });

    await db.insert(messageTemplates).values([
      {
        ptId,
        name: LEGACY_REMINDER_TEMPLATE.name,
        language: LEGACY_REMINDER_TEMPLATE.language,
        status: 'approved',
        body: LEGACY_REMINDER_TEMPLATE.body,
      },
      {
        ptId,
        name: FALLBACK_REMINDER_TEMPLATE.name,
        language: FALLBACK_REMINDER_TEMPLATE.language,
        status: 'approved',
        body: FALLBACK_REMINDER_TEMPLATE.body,
      },
    ]);
    const fallbackReady = await loadReminderAttempt({
      ptId,
      appointmentId,
      runId: 'run-template-priority',
      scheduledFor,
    });
    expect(fallbackReady.kind).toBe('ready');
    if (fallbackReady.kind === 'ready') {
      expect(fallbackReady.template.name).toBe(FALLBACK_REMINDER_TEMPLATE.name);
    }

    await db.insert(messageTemplates).values({
      ptId,
      name: REMINDER_TEMPLATE.name,
      language: REMINDER_TEMPLATE.language,
      status: 'approved',
      body: REMINDER_TEMPLATE.body,
    });
    const primaryReady = await loadReminderAttempt({
      ptId,
      appointmentId,
      runId: 'run-template-priority',
      scheduledFor,
    });
    expect(primaryReady.kind).toBe('ready');
    if (primaryReady.kind === 'ready') {
      expect(primaryReady.template.name).toBe(REMINDER_TEMPLATE.name);
    }
  });

  it('skips reminders for opted-out patients and inactive connections', async () => {
    const scheduledFor = subHours(startsAt, 24);
    await upsertReminderSchedule({
      ptId,
      appointmentId,
      scheduledFor,
      runId: 'run-skip-guards',
    });

    await db
      .update(patients)
      .set({ reminderOptedOutAt: new Date() })
      .where(eq(patients.id, patientId));
    await expect(
      loadReminderAttempt({
        ptId,
        appointmentId,
        runId: 'run-skip-guards',
        scheduledFor,
      }),
    ).resolves.toEqual({ kind: 'skipped', reason: 'patient_opted_out' });

    await db
      .update(patients)
      .set({ reminderOptedOutAt: null })
      .where(eq(patients.id, patientId));
    await db
      .update(whatsappConnections)
      .set({ status: 'revoked' })
      .where(eq(whatsappConnections.id, connectionId));
    await expect(
      loadReminderAttempt({
        ptId,
        appointmentId,
        runId: 'run-skip-guards',
        scheduledFor,
      }),
    ).resolves.toEqual({ kind: 'skipped', reason: 'connection_inactive' });
  });
});
