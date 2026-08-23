import { TZDate } from '@date-fns/tz';
import { endOfISOWeek, startOfISOWeek } from 'date-fns';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  appointments,
  conversations,
  events,
  messages,
  customers,
  accounts,
  reminderJobs,
} from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { DAY, testNow, zonedTime } from '@/tests/support/clock';
import { getTodaySnapshot } from '../queries';

// Practice days, not calendar dates: each test needs "a day" and "the day after"
// in Europe/Tirane, derived from the clock. The two days are held well apart so
// the rows one test leaves behind are never inside the other's practice day.
const DAY_ONE = new Date(testNow().getTime() - 30 * DAY);
const DAY_TWO = new Date(testNow().getTime() + 10 * DAY);

let accountId = '';
let customerA = '';
let customerB = '';

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `today-${Date.now()}@example.com`,
    password: 'today-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Missing user');
  accountId = data.user.id;
  await db
    .update(accounts)
    .set({ timezone: 'Europe/Tirane' })
    .where(eq(accounts.id, accountId));
  const rows = await db
    .insert(customers)
    .values([
      { accountId, name: 'Escalated Client', phone: '+355690000001' },
      { accountId, name: 'Reminder Client', phone: '+355690000002' },
    ])
    .returning({ id: customers.id });
  [customerA, customerB] = rows.map((row) => row.id);
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

describe('getTodaySnapshot', () => {
  it('uses practice-day boundaries and lets escalation win reminder deduplication', async () => {
    const now = zonedTime(DAY_ONE, 10, 15);
    const [conversation] = await db
      .insert(conversations)
      .values({
        accountId,
        customerId: customerA,
        channel: 'whatsapp',
        escalationState: 'pending',
        lastInboundAt: now,
      })
      .returning({ id: conversations.id });
    const appts = await db
      .insert(appointments)
      .values([
        {
          accountId,
          customerId: customerA,
          startsAt: zonedTime(DAY_ONE, 10),
          endsAt: zonedTime(DAY_ONE, 10, 45),
          serviceType: 'Vlerësim i parë',
          status: 'confirmed',
        },
        {
          accountId,
          customerId: customerB,
          startsAt: zonedTime(DAY_ONE, 14),
          endsAt: zonedTime(DAY_ONE, 14, 30),
          serviceType: 'Seancë vijuese',
        },
      ])
      .returning({ id: appointments.id });
    await db.insert(reminderJobs).values([
      { accountId, appointmentId: appts[0].id, scheduledFor: now, status: 'sent' },
      { accountId, appointmentId: appts[1].id, scheduledFor: now, status: 'sent' },
    ]);

    const snapshot = await getTodaySnapshot(accountId, now);
    expect(snapshot.next).toMatchObject({
      id: appts[0].id,
      startLabel: '10:00',
    });
    expect(snapshot.later.map((appointment) => appointment.id)).toEqual([
      appts[1].id,
    ]);
    expect(
      snapshot.attention.map((item) => [item.customerId, item.kind]),
    ).toEqual([
      [customerA, 'escalation'],
      [customerB, 'reminder'],
    ]);
    expect(conversation.id).toBeTruthy();
  });

  it('names the day of an unanswered reminder for a later appointment', async () => {
    const now = zonedTime(DAY_TWO, 9);
    const [appointment] = await db
      .insert(appointments)
      .values({
        accountId,
        customerId: customerB,
        startsAt: zonedTime(new Date(DAY_TWO.getTime() + DAY), 10),
        endsAt: zonedTime(new Date(DAY_TWO.getTime() + DAY), 10, 30),
        serviceType: 'Seancë vijuese',
        status: 'confirmed',
      })
      .returning({ id: appointments.id });
    await db.insert(reminderJobs).values({
      accountId,
      appointmentId: appointment.id,
      scheduledFor: zonedTime(DAY_TWO, 10),
      status: 'sent',
    });

    const snapshot = await getTodaySnapshot(accountId, now);
    const reminder = snapshot.attention.find(
      (item) => item.kind === 'reminder',
    );
    expect(reminder?.customerId).toBe(customerB);
    expect(reminder?.appointment?.startLabel).toBe('Nesër 10:00');
    // Tomorrow's appointment never joins today's timeline.
    expect(snapshot.next).toBeNull();
  });

  it('week strip counts only rows inside the current ISO week', async () => {
    // Years in the past so this test's ISO week can never contain a stray
    // `createdAt` default (real wall-clock time) from another insert in this
    // file or test run — derived, so it stays years back forever.
    const now = zonedTime(new Date(testNow().getTime() - 3 * 365 * DAY), 9);
    const zonedNow = new TZDate(now, 'Europe/Tirane');
    const weekStart = new Date(startOfISOWeek(zonedNow).getTime());
    const weekEnd = new Date(endOfISOWeek(zonedNow).getTime());
    const inWeek = new Date(weekStart.getTime() + 60_000);
    const beforeWeek = new Date(weekStart.getTime() - 60_000);
    const afterWeek = new Date(weekEnd.getTime() + 60_000);

    const [conversation] = await db
      .insert(conversations)
      .values({ accountId, customerId: customerA, channel: 'whatsapp' })
      .onConflictDoNothing({
        target: [conversations.customerId, conversations.channel],
      })
      .returning({ id: conversations.id });
    const conversationId =
      conversation?.id ??
      (
        await db
          .select({ id: conversations.id })
          .from(conversations)
          .where(eq(conversations.customerId, customerA))
          .limit(1)
      )[0].id;

    await db.insert(messages).values([
      {
        accountId,
        conversationId,
        role: 'customer',
        channel: 'whatsapp',
        content: 'in week',
        createdAt: inWeek,
      },
      {
        accountId,
        conversationId,
        role: 'customer',
        channel: 'whatsapp',
        content: 'before week',
        createdAt: beforeWeek,
      },
      {
        accountId,
        conversationId,
        role: 'customer',
        channel: 'whatsapp',
        content: 'after week',
        createdAt: afterWeek,
      },
      {
        accountId,
        conversationId,
        role: 'account',
        channel: 'whatsapp',
        content: 'account reply in week (not a received message)',
        createdAt: inWeek,
      },
    ]);

    await db.insert(appointments).values([
      {
        accountId,
        customerId: customerB,
        startsAt: new Date(inWeek.getTime() + 60 * 60_000),
        endsAt: new Date(inWeek.getTime() + 2 * 60 * 60_000),
        serviceType: 'Në javë',
        status: 'confirmed',
        createdAt: inWeek,
      },
      {
        accountId,
        customerId: customerB,
        startsAt: new Date(afterWeek.getTime() + 60 * 60_000),
        endsAt: new Date(afterWeek.getTime() + 2 * 60 * 60_000),
        serviceType: 'Jashtë javës',
        status: 'confirmed',
        createdAt: afterWeek,
      },
    ]);

    await db.insert(events).values([
      { accountId, type: 'conversation.escalated', payload: {}, occurredAt: inWeek },
      {
        accountId,
        type: 'conversation.escalated',
        payload: {},
        occurredAt: beforeWeek,
      },
    ]);

    const snapshot = await getTodaySnapshot(accountId, now);
    expect(snapshot.week).toEqual({
      messagesReceived: 1,
      bookings: 1,
      escalations: 1,
    });
  });
});
