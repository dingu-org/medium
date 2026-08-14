import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  conversations,
  eventOutbox,
  events,
  messages,
  patients,
  pts,
  reminderDeliveries,
  reminderJobs,
  waMessageStatuses,
  whatsappConnections,
} from '@/lib/db/schema';
import {
  countScheduledRemindersInMonth,
  emitReminderLimitReachedOnce,
  emitReminderPredictiveWarningOnce,
  getReminderUsage,
  reminderQuotaAvailable,
} from '@/lib/billing/usage';
import { runBillingUsageMonitor } from '@/lib/inngest/functions/billing-usage-monitor';
import { getPlan } from '@/lib/billing/plans';
import { createServiceClient } from '@/lib/supabase/service';
import { DAY, testNow } from '@/tests/support/clock';

const FREE_REMINDERS = getPlan('free').remindersPerMonth;
// Derived, not written down: every quota window here is a calendar month, and a
// literal month stops matching the month the DB defaults land in the moment the
// wall clock moves past it. Pinning to the 15th keeps "this month" and "last
// month" unambiguous whatever the month's length (PT timezone is UTC in setup).
const NOW = testNow({ dayOfMonth: 15 });
const MONTH_KEY = NOW.toISOString().slice(0, 7);
const IN_MONTH = new Date(NOW.getTime() - 5 * DAY);
// 25 days back from the 15th lands on the 18th–21st of the previous month for
// every month length, so this is always genuinely last month.
const PRIOR_MONTH = new Date(NOW.getTime() - 25 * DAY);
// Sent-but-unconfirmed only holds a quota slot for an hour after the send.
const JUST_SENT = new Date(NOW.getTime() - 5 * 60_000);

let ptId = '';
let patientId = '';
let conversationId = '';
let apptOffset = 0;

/**
 * Seed one reminder_jobs row (each needs its own appointment — unique index).
 * A confirmed delivery is the pair the webhook writes: the job's latest-cycle
 * stamp AND the `reminder_deliveries` row the month is actually counted from.
 */
async function seedReminderJob(opts: {
  status: 'sent' | 'scheduled' | 'requeued';
  deliveredAt?: Date | null;
  sentAt?: Date | null;
  apptStatus?: 'pending' | 'confirmed' | 'cancelled';
  startsAt?: Date;
  /** Meta reported this send undeliverable (wa_message_statuses.failed_at). */
  metaFailedAt?: Date;
}): Promise<void> {
  apptOffset += 1;
  const startsAt =
    opts.startsAt ?? new Date(NOW.getTime() + apptOffset * 3_600_000);
  const [appt] = await db
    .insert(appointments)
    .values({
      ptId,
      patientId,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 30 * 60_000),
      status: opts.apptStatus ?? 'confirmed',
    })
    .returning({ id: appointments.id });

  let messageId: string | null = null;
  if (opts.metaFailedAt) {
    const externalId = `wamid.usage-${apptOffset}-${Date.now()}`;
    const [message] = await db
      .insert(messages)
      .values({
        ptId,
        conversationId,
        externalId,
        role: 'ai',
        channel: 'whatsapp',
        content: 'Kujtesë',
      })
      .returning({ id: messages.id });
    messageId = message.id;
    await db.insert(waMessageStatuses).values({
      ptId,
      externalId,
      lastStatus: 'failed',
      failedAt: opts.metaFailedAt,
    });
  }

  await db.insert(reminderJobs).values({
    ptId,
    appointmentId: appt.id,
    scheduledFor: new Date(NOW.getTime() + 1_800_000),
    status: opts.status,
    sentAt: opts.sentAt ?? null,
    deliveredAt: opts.deliveredAt ?? null,
    messageId,
  });

  if (opts.deliveredAt) {
    await db.insert(reminderDeliveries).values({
      ptId,
      appointmentId: appt.id,
      externalId: `wamid.delivered-${apptOffset}-${Date.now()}`,
      deliveredAt: opts.deliveredAt,
    });
  }
}

async function reminderEvents(type: string, kind: string) {
  const rows = await db
    .select({ payload: events.payload })
    .from(events)
    .where(and(eq(events.ptId, ptId), eq(events.type, type)));
  return rows.filter(
    (r) => (r.payload as { kind?: string }).kind === kind,
  );
}

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `reminder-usage-${Date.now()}@example.com`,
    password: 'reminder-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
});

beforeEach(async () => {
  await db.delete(reminderJobs).where(eq(reminderJobs.ptId, ptId));
  // Deliberately outlives its appointment (ON DELETE SET NULL), so deleting the
  // appointments below leaves it behind — it needs its own cleanup.
  await db.delete(reminderDeliveries).where(eq(reminderDeliveries.ptId, ptId));
  await db.delete(appointments).where(eq(appointments.ptId, ptId));
  await db.delete(whatsappConnections).where(eq(whatsappConnections.ptId, ptId));
  await db.delete(eventOutbox).where(eq(eventOutbox.ptId, ptId));
  await db.delete(events).where(eq(events.ptId, ptId));
  await db.delete(waMessageStatuses).where(eq(waMessageStatuses.ptId, ptId));
  await db.delete(patients).where(eq(patients.ptId, ptId));
  await db
    .update(pts)
    .set({ plan: 'free', planLifetime: false, planExpiresAt: null, timezone: 'UTC' })
    .where(eq(pts.id, ptId));
  const [patient] = await db
    .insert(patients)
    .values({ ptId, name: 'Rem', phone: `+15550${Date.now()}`, waId: `wa-${Date.now()}` })
    .returning({ id: patients.id });
  patientId = patient.id;
  const [conversation] = await db
    .insert(conversations)
    .values({ ptId, patientId, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  conversationId = conversation.id;
  apptOffset = 0;
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

describe('getReminderUsage', () => {
  it('counts delivered + in-flight this month and excludes prior months', async () => {
    await seedReminderJob({ status: 'sent', deliveredAt: IN_MONTH, sentAt: IN_MONTH });
    await seedReminderJob({ status: 'sent', deliveredAt: IN_MONTH, sentAt: IN_MONTH });
    // in-flight: just sent, delivery confirmation still in transit.
    await seedReminderJob({ status: 'sent', deliveredAt: null, sentAt: JUST_SENT });
    // delivered last month — excluded from the current-month count.
    await seedReminderJob({
      status: 'sent',
      deliveredAt: PRIOR_MONTH,
      sentAt: PRIOR_MONTH,
    });

    const usage = await getReminderUsage(ptId, NOW);
    expect(usage.delivered).toBe(2);
    expect(usage.inFlight).toBe(1);
    expect(usage.used).toBe(3);
    expect(usage.limit).toBe(FREE_REMINDERS);
    expect(usage.remaining).toBe(FREE_REMINDERS - 3);
    expect(usage.monthKey).toBe(MONTH_KEY);
  });

  it('keeps counting an overnight send Meta has not confirmed yet', async () => {
    // The recipient's phone is off: Meta accepted the template and will keep
    // trying for ~30 days, so the send is still going to be delivered and
    // billed. Dropping it out of `used` after an hour re-opened the whole cap
    // every evening and billed the month at double the plan limit.
    await seedReminderJob({
      status: 'sent',
      deliveredAt: null,
      sentAt: new Date(NOW.getTime() - 3 * 86_400_000),
    });
    await seedReminderJob({
      status: 'sent',
      deliveredAt: null,
      sentAt: new Date(NOW.getTime() - 90 * 60_000),
    });

    const usage = await getReminderUsage(ptId, NOW);
    expect(usage.inFlight).toBe(2);
    expect(usage.used).toBe(2);
    expect(usage.remaining).toBe(FREE_REMINDERS - 2);
  });

  it('counts both billed cycles of a rescheduled appointment', async () => {
    // A reschedule re-arms the SAME reminder_jobs row (unique per appointment)
    // onto a second template Meta bills separately. The job's one delivered_at
    // scalar can only describe the later cycle, so counting that column made
    // every first template free.
    await seedReminderJob({
      status: 'sent',
      deliveredAt: IN_MONTH,
      sentAt: IN_MONTH,
    });
    const [job] = await db
      .select({ appointmentId: reminderJobs.appointmentId })
      .from(reminderJobs)
      .where(eq(reminderJobs.ptId, ptId));
    const secondDelivery = new Date(IN_MONTH.getTime() + 86_400_000);
    await db.insert(reminderDeliveries).values({
      ptId,
      appointmentId: job.appointmentId,
      externalId: `wamid.cycle2-${Date.now()}`,
      deliveredAt: secondDelivery,
    });
    await db
      .update(reminderJobs)
      .set({ sentAt: secondDelivery, deliveredAt: secondDelivery })
      .where(eq(reminderJobs.ptId, ptId));

    const usage = await getReminderUsage(ptId, NOW);
    expect(usage.delivered).toBe(2);
    expect(usage.inFlight).toBe(0);
    expect(usage.used).toBe(2);
  });

  it('ignores a redelivered webhook for a wamid already counted', async () => {
    await seedReminderJob({
      status: 'sent',
      deliveredAt: IN_MONTH,
      sentAt: IN_MONTH,
    });
    const [delivery] = await db
      .select()
      .from(reminderDeliveries)
      .where(eq(reminderDeliveries.ptId, ptId));

    // The unique wamid is what makes the count idempotent, whatever the webhook
    // does; a second row for the same template must be impossible.
    await expect(
      db.insert(reminderDeliveries).values({
        ptId,
        appointmentId: delivery.appointmentId,
        externalId: delivery.externalId,
        deliveredAt: new Date(IN_MONTH.getTime() + 60_000),
      }),
    ).rejects.toThrow();

    expect((await getReminderUsage(ptId, NOW)).delivered).toBe(1);
  });

  it('frees the slot of a send Meta reported undeliverable', async () => {
    await seedReminderJob({
      status: 'sent',
      deliveredAt: null,
      sentAt: JUST_SENT,
      metaFailedAt: new Date(NOW.getTime() - 60_000),
    });

    const usage = await getReminderUsage(ptId, NOW);
    expect(usage.inFlight).toBe(0);
    expect(usage.used).toBe(0);
    expect(usage.remaining).toBe(FREE_REMINDERS);
  });
});

describe('reminderQuotaAvailable (send-time gate)', () => {
  it('turns away a send once delivered + in-flight reaches the limit', async () => {
    for (let i = 0; i < FREE_REMINDERS; i += 1) {
      await seedReminderJob({ status: 'sent', deliveredAt: IN_MONTH, sentAt: IN_MONTH });
    }
    expect(await reminderQuotaAvailable(ptId, NOW)).toBe(false);
  });

  it('allows a send while under the limit', async () => {
    await seedReminderJob({ status: 'sent', deliveredAt: IN_MONTH, sentAt: IN_MONTH });
    expect(await reminderQuotaAvailable(ptId, NOW)).toBe(true);
  });

  it('still blocks at the limit when the last slot is a fresh in-flight send', async () => {
    for (let i = 0; i < FREE_REMINDERS - 1; i += 1) {
      await seedReminderJob({ status: 'sent', deliveredAt: IN_MONTH, sentAt: IN_MONTH });
    }
    await seedReminderJob({ status: 'sent', deliveredAt: null, sentAt: JUST_SENT });
    expect(await reminderQuotaAvailable(ptId, NOW)).toBe(false);
  });

  it('still blocks when the last slot is an unconfirmed send from days ago', async () => {
    for (let i = 0; i < FREE_REMINDERS - 1; i += 1) {
      await seedReminderJob({ status: 'sent', deliveredAt: IN_MONTH, sentAt: IN_MONTH });
    }
    await seedReminderJob({
      status: 'sent',
      deliveredAt: null,
      sentAt: new Date(NOW.getTime() - 3 * 86_400_000),
    });
    expect(await reminderQuotaAvailable(ptId, NOW)).toBe(false);
  });

  it('re-opens the last slot once Meta reports that send failed', async () => {
    for (let i = 0; i < FREE_REMINDERS - 1; i += 1) {
      await seedReminderJob({ status: 'sent', deliveredAt: IN_MONTH, sentAt: IN_MONTH });
    }
    await seedReminderJob({
      status: 'sent',
      deliveredAt: null,
      sentAt: new Date(NOW.getTime() - 3 * 86_400_000),
      metaFailedAt: new Date(NOW.getTime() - 2 * 86_400_000),
    });
    expect(await reminderQuotaAvailable(ptId, NOW)).toBe(true);
  });
});

describe('emitReminderLimitReachedOnce', () => {
  it('emits billing.limit_reached{kind:reminders} at most once per month', async () => {
    for (let i = 0; i < FREE_REMINDERS; i += 1) {
      await seedReminderJob({ status: 'sent', deliveredAt: IN_MONTH, sentAt: IN_MONTH });
    }
    await emitReminderLimitReachedOnce(ptId, NOW);
    await emitReminderLimitReachedOnce(ptId, NOW);

    const rows = await reminderEvents('billing.limit_reached', 'reminders');
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({
      kind: 'reminders',
      monthKey: MONTH_KEY,
      limit: FREE_REMINDERS,
    });
  });
});

describe('countScheduledRemindersInMonth', () => {
  it('counts queued reminders for active appointments before month end only', async () => {
    // upcoming, in-window. NOW is the 15th, so +5/+10 days is still this month
    // for every month length and +20 days is reliably the next one.
    await seedReminderJob({
      status: 'scheduled',
      startsAt: new Date(NOW.getTime() + 5 * DAY),
      apptStatus: 'confirmed',
    });
    await seedReminderJob({
      status: 'requeued',
      startsAt: new Date(NOW.getTime() + 10 * DAY),
      apptStatus: 'pending',
    });
    // next month — excluded.
    await seedReminderJob({
      status: 'scheduled',
      startsAt: new Date(NOW.getTime() + 20 * DAY),
      apptStatus: 'confirmed',
    });
    // cancelled appointment — excluded.
    await seedReminderJob({
      status: 'scheduled',
      startsAt: new Date(NOW.getTime() + 7 * DAY),
      apptStatus: 'cancelled',
    });
    // already sent — not "scheduled" — excluded.
    await seedReminderJob({
      status: 'sent',
      startsAt: new Date(NOW.getTime() + 8 * DAY),
      apptStatus: 'confirmed',
    });

    expect(await countScheduledRemindersInMonth(ptId, NOW)).toBe(2);
  });
});

describe('billing-usage-monitor (predictive reminder warning)', () => {
  async function seedActiveConnection() {
    await db.insert(whatsappConnections).values({
      ptId,
      phoneNumberId: `pni-${Date.now()}`,
      wabaId: `waba-${Date.now()}`,
      status: 'active',
    });
  }

  it('warns once when upcoming reminders exceed the remaining quota', async () => {
    await seedActiveConnection();
    // used = 8 → remaining = 2.
    for (let i = 0; i < 8; i += 1) {
      await seedReminderJob({ status: 'sent', deliveredAt: IN_MONTH, sentAt: IN_MONTH });
    }
    // upcoming = 5 (> remaining 2).
    for (let i = 0; i < 5; i += 1) {
      await seedReminderJob({
        status: 'scheduled',
        startsAt: new Date(NOW.getTime() + (5 + i) * DAY),
        apptStatus: 'confirmed',
      });
    }

    await runBillingUsageMonitor(NOW);
    await runBillingUsageMonitor(NOW); // dedupe: still one event.

    const rows = await reminderEvents(
      'billing.limit_warning',
      'reminders_predictive',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({
      kind: 'reminders_predictive',
      remaining: 2,
      upcoming: 5,
      monthKey: MONTH_KEY,
    });
  });

  it('does not warn when upcoming reminders fit within the remaining quota', async () => {
    await seedActiveConnection();
    for (let i = 0; i < 8; i += 1) {
      await seedReminderJob({ status: 'sent', deliveredAt: IN_MONTH, sentAt: IN_MONTH });
    }
    // upcoming = 1 (<= remaining 2).
    await seedReminderJob({
      status: 'scheduled',
      startsAt: new Date(NOW.getTime() + 5 * DAY),
      apptStatus: 'confirmed',
    });

    await runBillingUsageMonitor(NOW);

    const rows = await reminderEvents(
      'billing.limit_warning',
      'reminders_predictive',
    );
    expect(rows).toHaveLength(0);
  });
});

describe('emitReminderPredictiveWarningOnce', () => {
  it('carries used/limit/remaining/upcoming in the payload', async () => {
    await emitReminderPredictiveWarningOnce({
      ptId,
      monthKey: MONTH_KEY,
      used: 8,
      limit: FREE_REMINDERS,
      remaining: 2,
      upcoming: 5,
    });
    const rows = await reminderEvents(
      'billing.limit_warning',
      'reminders_predictive',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({
      used: 8,
      limit: FREE_REMINDERS,
      remaining: 2,
      upcoming: 5,
    });
  });
});
