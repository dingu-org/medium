import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  eventOutbox,
  events,
  patients,
  pts,
  reminderJobs,
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

const FREE_REMINDERS = getPlan('free').remindersPerMonth;
// Fixed clock so month bounds are deterministic (PT timezone is UTC in setup).
const NOW = new Date('2026-07-15T12:00:00Z');
const IN_MONTH = new Date('2026-07-10T10:00:00Z');
const PRIOR_MONTH = new Date('2026-06-20T10:00:00Z');
// Sent-but-unconfirmed only holds a quota slot for an hour after the send.
const JUST_SENT = new Date(NOW.getTime() - 5 * 60_000);

let ptId = '';
let patientId = '';
let apptOffset = 0;

/** Seed one reminder_jobs row (each needs its own appointment — unique index). */
async function seedReminderJob(opts: {
  status: 'sent' | 'scheduled' | 'requeued';
  deliveredAt?: Date | null;
  sentAt?: Date | null;
  apptStatus?: 'pending' | 'confirmed' | 'cancelled';
  startsAt?: Date;
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
  await db.insert(reminderJobs).values({
    ptId,
    appointmentId: appt.id,
    scheduledFor: new Date(NOW.getTime() + 1_800_000),
    status: opts.status,
    sentAt: opts.sentAt ?? null,
    deliveredAt: opts.deliveredAt ?? null,
  });
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
  await db.delete(appointments).where(eq(appointments.ptId, ptId));
  await db.delete(whatsappConnections).where(eq(whatsappConnections.ptId, ptId));
  await db.delete(eventOutbox).where(eq(eventOutbox.ptId, ptId));
  await db.delete(events).where(eq(events.ptId, ptId));
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
    expect(usage.monthKey).toBe('2026-07');
  });

  it('stops counting a never-confirmed send once it is older than an hour', async () => {
    // Recipient's device never came online: Meta accepted the template and sent
    // no further status. It must not hold a quota slot for the rest of the month.
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

  it('does not let a stale unconfirmed send consume the last slot', async () => {
    for (let i = 0; i < FREE_REMINDERS - 1; i += 1) {
      await seedReminderJob({ status: 'sent', deliveredAt: IN_MONTH, sentAt: IN_MONTH });
    }
    await seedReminderJob({
      status: 'sent',
      deliveredAt: null,
      sentAt: new Date(NOW.getTime() - 3 * 86_400_000),
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
      monthKey: '2026-07',
      limit: FREE_REMINDERS,
    });
  });
});

describe('countScheduledRemindersInMonth', () => {
  it('counts queued reminders for active appointments before month end only', async () => {
    // upcoming, in-window.
    await seedReminderJob({
      status: 'scheduled',
      startsAt: new Date('2026-07-20T09:00:00Z'),
      apptStatus: 'confirmed',
    });
    await seedReminderJob({
      status: 'requeued',
      startsAt: new Date('2026-07-25T09:00:00Z'),
      apptStatus: 'pending',
    });
    // next month — excluded.
    await seedReminderJob({
      status: 'scheduled',
      startsAt: new Date('2026-08-02T09:00:00Z'),
      apptStatus: 'confirmed',
    });
    // cancelled appointment — excluded.
    await seedReminderJob({
      status: 'scheduled',
      startsAt: new Date('2026-07-22T09:00:00Z'),
      apptStatus: 'cancelled',
    });
    // already sent — not "scheduled" — excluded.
    await seedReminderJob({
      status: 'sent',
      startsAt: new Date('2026-07-23T09:00:00Z'),
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
        startsAt: new Date(`2026-07-2${i}T09:00:00Z`),
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
      monthKey: '2026-07',
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
      startsAt: new Date('2026-07-20T09:00:00Z'),
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
      monthKey: '2026-07',
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
