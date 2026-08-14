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
  patients,
  pts,
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

let ptId = '';
let patientA = '';
let patientB = '';

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `today-${Date.now()}@example.com`,
    password: 'today-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Missing user');
  ptId = data.user.id;
  await db
    .update(pts)
    .set({ timezone: 'Europe/Tirane' })
    .where(eq(pts.id, ptId));
  const rows = await db
    .insert(patients)
    .values([
      { ptId, name: 'Escalated Client', phone: '+355690000001' },
      { ptId, name: 'Reminder Client', phone: '+355690000002' },
    ])
    .returning({ id: patients.id });
  [patientA, patientB] = rows.map((row) => row.id);
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

describe('getTodaySnapshot', () => {
  it('uses practice-day boundaries and lets escalation win reminder deduplication', async () => {
    const now = zonedTime(DAY_ONE, 10, 15);
    const [conversation] = await db
      .insert(conversations)
      .values({
        ptId,
        patientId: patientA,
        channel: 'whatsapp',
        escalationState: 'pending',
        lastInboundAt: now,
      })
      .returning({ id: conversations.id });
    const appts = await db
      .insert(appointments)
      .values([
        {
          ptId,
          patientId: patientA,
          startsAt: zonedTime(DAY_ONE, 10),
          endsAt: zonedTime(DAY_ONE, 10, 45),
          serviceType: 'Vlerësim i parë',
          status: 'confirmed',
        },
        {
          ptId,
          patientId: patientB,
          startsAt: zonedTime(DAY_ONE, 14),
          endsAt: zonedTime(DAY_ONE, 14, 30),
          serviceType: 'Seancë vijuese',
        },
      ])
      .returning({ id: appointments.id });
    await db.insert(reminderJobs).values([
      { ptId, appointmentId: appts[0].id, scheduledFor: now, status: 'sent' },
      { ptId, appointmentId: appts[1].id, scheduledFor: now, status: 'sent' },
    ]);

    const snapshot = await getTodaySnapshot(ptId, now);
    expect(snapshot.next).toMatchObject({
      id: appts[0].id,
      startLabel: '10:00',
    });
    expect(snapshot.later.map((appointment) => appointment.id)).toEqual([
      appts[1].id,
    ]);
    expect(
      snapshot.attention.map((item) => [item.patientId, item.kind]),
    ).toEqual([
      [patientA, 'escalation'],
      [patientB, 'reminder'],
    ]);
    expect(conversation.id).toBeTruthy();
  });

  it('names the day of an unanswered reminder for a later appointment', async () => {
    const now = zonedTime(DAY_TWO, 9);
    const [appointment] = await db
      .insert(appointments)
      .values({
        ptId,
        patientId: patientB,
        startsAt: zonedTime(new Date(DAY_TWO.getTime() + DAY), 10),
        endsAt: zonedTime(new Date(DAY_TWO.getTime() + DAY), 10, 30),
        serviceType: 'Seancë vijuese',
        status: 'confirmed',
      })
      .returning({ id: appointments.id });
    await db.insert(reminderJobs).values({
      ptId,
      appointmentId: appointment.id,
      scheduledFor: zonedTime(DAY_TWO, 10),
      status: 'sent',
    });

    const snapshot = await getTodaySnapshot(ptId, now);
    const reminder = snapshot.attention.find(
      (item) => item.kind === 'reminder',
    );
    expect(reminder?.patientId).toBe(patientB);
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
      .values({ ptId, patientId: patientA, channel: 'whatsapp' })
      .onConflictDoNothing({
        target: [conversations.patientId, conversations.channel],
      })
      .returning({ id: conversations.id });
    const conversationId =
      conversation?.id ??
      (
        await db
          .select({ id: conversations.id })
          .from(conversations)
          .where(eq(conversations.patientId, patientA))
          .limit(1)
      )[0].id;

    await db.insert(messages).values([
      {
        ptId,
        conversationId,
        role: 'patient',
        channel: 'whatsapp',
        content: 'in week',
        createdAt: inWeek,
      },
      {
        ptId,
        conversationId,
        role: 'patient',
        channel: 'whatsapp',
        content: 'before week',
        createdAt: beforeWeek,
      },
      {
        ptId,
        conversationId,
        role: 'patient',
        channel: 'whatsapp',
        content: 'after week',
        createdAt: afterWeek,
      },
      {
        ptId,
        conversationId,
        role: 'pt',
        channel: 'whatsapp',
        content: 'pt reply in week (not a received message)',
        createdAt: inWeek,
      },
    ]);

    await db.insert(appointments).values([
      {
        ptId,
        patientId: patientB,
        startsAt: new Date(inWeek.getTime() + 60 * 60_000),
        endsAt: new Date(inWeek.getTime() + 2 * 60 * 60_000),
        serviceType: 'Në javë',
        status: 'confirmed',
        createdAt: inWeek,
      },
      {
        ptId,
        patientId: patientB,
        startsAt: new Date(afterWeek.getTime() + 60 * 60_000),
        endsAt: new Date(afterWeek.getTime() + 2 * 60 * 60_000),
        serviceType: 'Jashtë javës',
        status: 'confirmed',
        createdAt: afterWeek,
      },
    ]);

    await db.insert(events).values([
      { ptId, type: 'conversation.escalated', payload: {}, occurredAt: inWeek },
      {
        ptId,
        type: 'conversation.escalated',
        payload: {},
        occurredAt: beforeWeek,
      },
    ]);

    const snapshot = await getTodaySnapshot(ptId, now);
    expect(snapshot.week).toEqual({
      messagesReceived: 1,
      bookings: 1,
      escalations: 1,
    });
  });
});
