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

// The outbox->Inngest publish is best-effort and covered by the outbox suite;
// stubbing it keeps these tests free of network retries while still exercising
// the durable `events`/`event_outbox` rows appendBackgroundEvent writes.
vi.mock('@/lib/events/outbox', () => ({
  tryPublishOutboxEvent: vi.fn(async () => {}),
}));

import { addHours, addMinutes, subHours } from 'date-fns';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  conversations,
  eventOutbox,
  events,
  messageTemplates,
  messages,
  customers,
  accounts,
  reminderDeliveries,
  reminderJobs,
  whatsappConnections,
} from '@/lib/db/schema';
import { encryptToken } from '@/lib/db/crypto';
import { getReminderUsage } from '@/lib/billing/usage';
import { createServiceClient } from '@/lib/supabase/service';
import {
  ENGLISH_REMINDER_TEMPLATE,
  FALLBACK_REMINDER_TEMPLATE,
  LEGACY_REMINDER_TEMPLATE,
  REMINDER_TEMPLATE,
} from '../bootstrap-wa-connection';
import {
  appointmentEventPlan,
  persistAppointmentConfirmation,
  prepareAppointmentConfirmation,
  recordConfirmationFailure,
  sendAppointmentConfirmation,
} from '../appointment-events';
import {
  computeReminderSchedule,
  loadReminderAttempt,
  recordReminderFailure,
  recordShortNoticeSkip,
  upsertReminderSchedule,
} from '../send-reminder';
import { testNowUtc } from '@/tests/support/clock';

let accountId = '';
let customerId = '';
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
  accountId = data.user.id;
});

beforeEach(async () => {
  await db.delete(messageTemplates).where(eq(messageTemplates.accountId, accountId));
  // Outlives its appointment by design (ON DELETE SET NULL), so the customer
  // delete below leaves it behind — it needs its own cleanup.
  await db.delete(reminderDeliveries).where(eq(reminderDeliveries.accountId, accountId));
  await db
    .delete(whatsappConnections)
    .where(eq(whatsappConnections.accountId, accountId));
  await db.delete(customers).where(eq(customers.accountId, accountId));
  await db
    .update(accounts)
    .set({ timezone: 'Europe/Tirane', name: 'Move Well' })
    .where(eq(accounts.id, accountId));

  const [connection] = await db
    .insert(whatsappConnections)
    .values({
      accountId,
      phoneNumberId: `PNI_APPT_JOB_${Date.now()}_${++sequence}`,
      wabaId: 'WABA_APPT_JOB',
      accessTokenEncrypted: await encryptToken('APPT_JOB_TOKEN'),
      status: 'active',
      tier: 'TIER_250',
    })
    .returning({ id: whatsappConnections.id });
  connectionId = connection.id;

  const [customer] = await db
    .insert(customers)
    .values({
      accountId,
      name: 'Alex Customer',
      phone: '447700900101',
      waId: '447700900101',
    })
    .returning({ id: customers.id });
  customerId = customer.id;

  const [conversation] = await db
    .insert(conversations)
    .values({
      accountId,
      customerId,
      channel: 'whatsapp',
      lastInboundAt: new Date(),
    })
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

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

describe('appointment event confirmation', () => {
  it('uses the domain event ID to persist and deliver only once', async () => {
    const sourceEventId = randomUUID();
    const first = await prepareAppointmentConfirmation({
      sourceEventId,
      kind: 'appointment.booked',
      accountId,
      appointmentId,
      startsAt,
    });
    const second = await prepareAppointmentConfirmation({
      sourceEventId,
      kind: 'appointment.booked',
      accountId,
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

  /**
   * The turn that made the change has already sent the customer this exact text,
   * so the job is the second sender and returns before preparing anything. The
   * suppression is final: with one producer per change there is nothing to
   * coordinate with, so no sleep and no re-check can reverse it.
   */
  it('prepares and sends nothing for a conversation-originated change', async () => {
    const sourceEventId = randomUUID();
    const sendFn = vi.fn(async () => ({ messageId: 'wamid.NEVER' }));
    const plan = appointmentEventPlan({
      kind: 'appointment.booked',
      origin: 'conversation',
    });
    if (plan.confirmCustomer) {
      const confirmation = await prepareAppointmentConfirmation({
        sourceEventId,
        kind: 'appointment.booked',
        accountId,
        appointmentId,
        startsAt,
      });
      if (confirmation.kind === 'ready') {
        await sendAppointmentConfirmation({ ...confirmation, sendFn });
      }
    }

    expect(plan).toEqual({
      notifyAccount: true,
      confirmCustomer: false,
      skipped: 'conversation_replied',
    });
    expect(sendFn).not.toHaveBeenCalled();
    const stored = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.sourceEventId, sourceEventId));
    expect(stored).toHaveLength(0);
  });

  it('confirms a PT-originated change on the first pass', async () => {
    const sourceEventId = randomUUID();
    const sendFn = vi.fn(async () => ({ messageId: 'wamid.PT_ORIGIN' }));
    const plan = appointmentEventPlan({
      kind: 'appointment.booked',
      origin: 'account',
    });
    expect(plan).toEqual({ notifyAccount: true, confirmCustomer: true });

    const confirmation = await prepareAppointmentConfirmation({
      sourceEventId,
      kind: 'appointment.booked',
      accountId,
      appointmentId,
      startsAt,
    });
    expect(confirmation.kind).toBe('ready');
    if (confirmation.kind !== 'ready') return;
    await expect(
      sendAppointmentConfirmation({ ...confirmation, sendFn }),
    ).resolves.toEqual({ externalId: 'wamid.PT_ORIGIN', replay: false });

    expect(sendFn).toHaveBeenCalledTimes(1);
    expect(confirmation.content).toContain('Takimi juaj u rezervua');
  });

  it('surfaces a confirmation whose sends all failed instead of leaving it silent', async () => {
    await db.delete(events).where(eq(events.accountId, accountId));
    const sourceEventId = randomUUID();
    const prepared = await prepareAppointmentConfirmation({
      sourceEventId,
      kind: 'appointment.cancelled',
      accountId,
      appointmentId,
      startsAt,
    });
    expect(prepared.kind).toBe('ready');

    // Every Graph attempt 5xx'd, so the row still carries a NULL externalId and
    // nothing else would ever tell the PT the customer was not reached.
    await expect(
      recordConfirmationFailure({ accountId, sourceEventId }),
    ).resolves.toEqual({ recorded: true });

    const [failure] = await db
      .select()
      .from(events)
      .where(
        and(eq(events.accountId, accountId), eq(events.type, 'conversation.failed')),
      );
    expect(failure.payload).toMatchObject({ accountId, conversationId });
    const outbox = await db
      .select({ eventType: eventOutbox.eventType })
      .from(eventOutbox)
      .where(eq(eventOutbox.eventId, failure.id));
    expect(outbox).toEqual([{ eventType: 'conversation.failed' }]);
  });

  it('stays quiet when the confirmation did reach the customer', async () => {
    await db.delete(events).where(eq(events.accountId, accountId));
    const sourceEventId = randomUUID();
    const prepared = await prepareAppointmentConfirmation({
      sourceEventId,
      kind: 'appointment.booked',
      accountId,
      appointmentId,
      startsAt,
    });
    expect(prepared.kind).toBe('ready');
    if (prepared.kind !== 'ready') return;
    await persistAppointmentConfirmation({
      messageId: prepared.messageId,
      externalId: 'wamid.DELIVERED',
    });

    await expect(
      recordConfirmationFailure({ accountId, sourceEventId }),
    ).resolves.toEqual({
      recorded: false,
      reason: 'no_undelivered_confirmation',
    });
    const failures = await db
      .select()
      .from(events)
      .where(
        and(eq(events.accountId, accountId), eq(events.type, 'conversation.failed')),
      );
    expect(failures).toHaveLength(0);
  });
});

describe('reminder scheduling and guards', () => {
  it('schedules 24 hours before, delays short-notice reminders, and skips under two hours', () => {
    const now = testNowUtc();
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
      accountId,
      appointmentId,
      scheduledFor: firstSchedule,
      runId: 'run-first',
    });
    const nextSchedule = addHours(firstSchedule, 2);
    await upsertReminderSchedule({
      accountId,
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

  /**
   * Cycle 1: the reminder was sent, Meta confirmed it, the customer answered.
   * A confirmed delivery is two writes, as the statuses webhook makes them: the
   * job's latest-cycle stamp and the `reminder_deliveries` row the month is
   * counted from.
   */
  async function seedDeliveredAndAnsweredCycle(
    deliveredAt: Date,
  ): Promise<void> {
    const [reply] = await db
      .insert(messages)
      .values({
        accountId,
        conversationId,
        role: 'customer',
        channel: 'whatsapp',
        content: 'KONFIRMO',
      })
      .returning({ id: messages.id });
    await db
      .update(reminderJobs)
      .set({
        status: 'sent',
        sentAt: deliveredAt,
        deliveredAt,
        responseType: 'confirm',
        respondedAt: deliveredAt,
        responseMessageId: reply.id,
      })
      .where(eq(reminderJobs.appointmentId, appointmentId));
    await db.insert(reminderDeliveries).values({
      accountId,
      appointmentId,
      externalId: `wamid.cycle1-${Date.now()}-${++sequence}`,
      deliveredAt,
    });
  }

  it('clears the previous cycle response but keeps its delivery when a reschedule re-arms the row', async () => {
    await upsertReminderSchedule({
      accountId,
      appointmentId,
      scheduledFor: subHours(startsAt, 24),
      runId: 'run-first-cycle',
    });
    const deliveredAt = new Date();
    await seedDeliveredAndAnsweredCycle(deliveredAt);

    await upsertReminderSchedule({
      accountId,
      appointmentId,
      scheduledFor: addHours(subHours(startsAt, 24), 2),
      runId: 'run-second-cycle',
    });

    const [rearmed] = await db
      .select()
      .from(reminderJobs)
      .where(eq(reminderJobs.appointmentId, appointmentId));
    // The answer belonged to cycle 1, so it goes; the delivery Meta billed does
    // not — clearing it would refund the month's quota on every reschedule.
    expect(rearmed).toMatchObject({
      status: 'scheduled',
      inngestRunId: 'run-second-cycle',
      sentAt: null,
      messageId: null,
      responseType: null,
      respondedAt: null,
      responseMessageId: null,
    });
    expect(rearmed.deliveredAt).toEqual(deliveredAt);

    const usage = await getReminderUsage(accountId, deliveredAt);
    expect(usage.delivered).toBe(1);
    expect(usage.used).toBe(1);

    // Cycle 2 goes out: a second, separately-billed template on the SAME row.
    // `delivered_at` still holds cycle 1's delivery and nothing ever clears it,
    // so a quota read keyed on `delivered_at IS NULL` saw the new send in
    // neither direction — it was invisible until Meta's bill arrived.
    const [secondMessage] = await db
      .insert(messages)
      .values({
        accountId,
        conversationId,
        role: 'ai',
        channel: 'whatsapp',
        content: 'Kujtesë (cikli 2)',
        model: 'deterministic-reminder',
        provider: 'internal',
      })
      .returning({ id: messages.id });
    await db
      .update(reminderJobs)
      .set({
        status: 'sent',
        sentAt: deliveredAt,
        messageId: secondMessage.id,
      })
      .where(eq(reminderJobs.appointmentId, appointmentId));

    const secondCycle = await getReminderUsage(accountId, deliveredAt);
    expect(secondCycle.inFlight).toBe(1);
    expect(secondCycle.used).toBe(2);
  });

  it('records a run failure as a durable reminder.failed the bell can read', async () => {
    await db.delete(events).where(eq(events.accountId, accountId));
    await recordReminderFailure({
      accountId,
      appointmentId,
      scheduledFor: subHours(startsAt, 24),
      runId: 'run-exhausted',
      error: 'Error: Graph 500',
    });

    const [failure] = await db
      .select()
      .from(events)
      .where(and(eq(events.accountId, accountId), eq(events.type, 'reminder.failed')));
    expect(failure.payload).toMatchObject({
      accountId,
      appointmentId,
      reason: 'Error: Graph 500',
    });
    const outbox = await db
      .select({ eventType: eventOutbox.eventType })
      .from(eventOutbox)
      .where(eq(eventOutbox.eventId, failure.id));
    expect(outbox).toEqual([{ eventType: 'reminder.failed' }]);

    const [job] = await db
      .select({
        status: reminderJobs.status,
        lastError: reminderJobs.lastError,
      })
      .from(reminderJobs)
      .where(eq(reminderJobs.appointmentId, appointmentId));
    expect(job).toEqual({ status: 'failed', lastError: 'Error: Graph 500' });
  });

  it('keeps the delivery and the answer when a short-notice move parks the row', async () => {
    await upsertReminderSchedule({
      accountId,
      appointmentId,
      scheduledFor: subHours(startsAt, 24),
      runId: 'run-first-cycle',
    });
    const deliveredAt = new Date();
    await seedDeliveredAndAnsweredCycle(deliveredAt);

    // No replacement reminder follows a short-notice skip, so nothing would ever
    // re-stamp a cleared delivery: the month's usage must not move.
    await recordShortNoticeSkip({
      accountId,
      appointmentId,
      startsAt: addMinutes(deliveredAt, 30),
      runId: 'run-short-notice',
      reason: 'short_notice',
    });

    const [parked] = await db
      .select()
      .from(reminderJobs)
      .where(eq(reminderJobs.appointmentId, appointmentId));
    expect(parked).toMatchObject({
      status: 'skipped',
      skippedReason: 'short_notice',
      inngestRunId: 'run-short-notice',
      responseType: 'confirm',
    });
    expect(parked.deliveredAt).toEqual(deliveredAt);
    expect(parked.respondedAt).toEqual(deliveredAt);

    const usage = await getReminderUsage(accountId, deliveredAt);
    expect(usage.delivered).toBe(1);
  });

  it('requeues for an unapproved template, becomes ready after approval, and rejects stale runs', async () => {
    const scheduledFor = subHours(startsAt, 24);
    await upsertReminderSchedule({
      accountId,
      appointmentId,
      scheduledFor,
      runId: 'run-current',
    });
    const [template] = await db
      .insert(messageTemplates)
      .values({
        accountId,
        name: REMINDER_TEMPLATE.name,
        language: REMINDER_TEMPLATE.language,
        status: 'pending',
        body: REMINDER_TEMPLATE.body,
      })
      .returning({ id: messageTemplates.id });

    await expect(
      loadReminderAttempt({
        accountId,
        appointmentId,
        runId: 'run-current',
        scheduledFor,
      }),
    ).resolves.toEqual({
      kind: 'retry',
      reason: 'template_not_approved',
    });

    await db.insert(messageTemplates).values({
      accountId,
      name: ENGLISH_REMINDER_TEMPLATE.name,
      language: ENGLISH_REMINDER_TEMPLATE.language,
      status: 'approved',
      body: ENGLISH_REMINDER_TEMPLATE.body,
    });
    const englishFallback = await loadReminderAttempt({
      accountId,
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
      accountId,
      appointmentId,
      runId: 'run-current',
      scheduledFor,
    });
    expect(ready.kind).toBe('ready');
    if (ready.kind === 'ready') {
      expect(ready.context).toMatchObject({
        appointmentId,
        customerId,
        conversationId,
        connectionId,
      });
      expect(ready.template.name).toBe(REMINDER_TEMPLATE.name);
    }

    await expect(
      loadReminderAttempt({
        accountId,
        appointmentId,
        runId: 'run-stale',
        scheduledFor,
      }),
    ).resolves.toEqual({ kind: 'skipped', reason: 'stale_run' });
  });

  it('chooses approved templates in v2, fallback, legacy order', async () => {
    const scheduledFor = subHours(startsAt, 24);
    await upsertReminderSchedule({
      accountId,
      appointmentId,
      scheduledFor,
      runId: 'run-template-priority',
    });

    await db.insert(messageTemplates).values([
      {
        accountId,
        name: LEGACY_REMINDER_TEMPLATE.name,
        language: LEGACY_REMINDER_TEMPLATE.language,
        status: 'approved',
        body: LEGACY_REMINDER_TEMPLATE.body,
      },
      {
        accountId,
        name: FALLBACK_REMINDER_TEMPLATE.name,
        language: FALLBACK_REMINDER_TEMPLATE.language,
        status: 'approved',
        body: FALLBACK_REMINDER_TEMPLATE.body,
      },
    ]);
    const fallbackReady = await loadReminderAttempt({
      accountId,
      appointmentId,
      runId: 'run-template-priority',
      scheduledFor,
    });
    expect(fallbackReady.kind).toBe('ready');
    if (fallbackReady.kind === 'ready') {
      expect(fallbackReady.template.name).toBe(FALLBACK_REMINDER_TEMPLATE.name);
    }

    await db.insert(messageTemplates).values({
      accountId,
      name: REMINDER_TEMPLATE.name,
      language: REMINDER_TEMPLATE.language,
      status: 'approved',
      body: REMINDER_TEMPLATE.body,
    });
    const primaryReady = await loadReminderAttempt({
      accountId,
      appointmentId,
      runId: 'run-template-priority',
      scheduledFor,
    });
    expect(primaryReady.kind).toBe('ready');
    if (primaryReady.kind === 'ready') {
      expect(primaryReady.template.name).toBe(REMINDER_TEMPLATE.name);
    }
  });

  it('reads a TIER_1K messaging limit as 1000, not 1', async () => {
    const scheduledFor = subHours(startsAt, 24);
    await upsertReminderSchedule({
      accountId,
      appointmentId,
      scheduledFor,
      runId: 'run-tier-1k',
    });
    await db
      .update(whatsappConnections)
      .set({ tier: 'TIER_1K' })
      .where(eq(whatsappConnections.id, connectionId));
    const [template] = await db
      .insert(messageTemplates)
      .values({
        accountId,
        name: REMINDER_TEMPLATE.name,
        language: REMINDER_TEMPLATE.language,
        status: 'approved',
        body: REMINDER_TEMPLATE.body,
      })
      .returning({ id: messageTemplates.id });
    // Two template sends already inside the rolling 24h window: well under
    // 1,000 × 0.95, but over the digit-scraped limit of 1.
    await db.insert(messages).values(
      [1, 2].map((index) => ({
        accountId,
        conversationId,
        externalId: `wamid.TIER.${Date.now()}.${sequence}.${index}`,
        role: 'ai' as const,
        channel: 'whatsapp' as const,
        content: 'Kujtesë',
        templateId: template.id,
        model: 'deterministic-reminder',
        provider: 'internal',
      })),
    );

    const state = await loadReminderAttempt({
      accountId,
      appointmentId,
      runId: 'run-tier-1k',
      scheduledFor,
    });
    expect(state.kind).toBe('ready');
  });

  it('skips reminders for opted-out customers and inactive connections', async () => {
    const scheduledFor = subHours(startsAt, 24);
    await upsertReminderSchedule({
      accountId,
      appointmentId,
      scheduledFor,
      runId: 'run-skip-guards',
    });

    await db
      .update(customers)
      .set({ reminderOptedOutAt: new Date() })
      .where(eq(customers.id, customerId));
    await expect(
      loadReminderAttempt({
        accountId,
        appointmentId,
        runId: 'run-skip-guards',
        scheduledFor,
      }),
    ).resolves.toEqual({ kind: 'skipped', reason: 'customer_opted_out' });

    await db
      .update(customers)
      .set({ reminderOptedOutAt: null })
      .where(eq(customers.id, customerId));
    await db
      .update(whatsappConnections)
      .set({ status: 'revoked' })
      .where(eq(whatsappConnections.id, connectionId));
    await expect(
      loadReminderAttempt({
        accountId,
        appointmentId,
        runId: 'run-skip-guards',
        scheduledFor,
      }),
    ).resolves.toEqual({ kind: 'skipped', reason: 'connection_inactive' });
  });
});
