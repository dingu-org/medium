import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  appointments,
  conversations,
  patients,
  pts,
  reminderJobs,
} from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { getTodaySnapshot } from '../queries';

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
    const now = new Date('2026-06-30T08:15:00.000Z'); // 10:15 in Tirane
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
          startsAt: new Date('2026-06-30T08:00:00.000Z'),
          endsAt: new Date('2026-06-30T08:45:00.000Z'),
          serviceType: 'Vlerësim i parë',
          status: 'confirmed',
        },
        {
          ptId,
          patientId: patientB,
          startsAt: new Date('2026-06-30T12:00:00.000Z'),
          endsAt: new Date('2026-06-30T12:30:00.000Z'),
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
    expect(snapshot.managedConversationCount).toBe(0);
    expect(conversation.id).toBeTruthy();
  });
});
