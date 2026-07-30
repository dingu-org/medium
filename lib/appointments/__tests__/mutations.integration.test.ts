import { and, eq } from 'drizzle-orm';
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
import { db } from '@/lib/db';
import { getPostgresErrorCode } from '@/lib/db/postgres-errors';
import {
  appointments,
  availabilityRules,
  eventOutbox,
  events,
  patients,
  pts,
} from '@/lib/db/schema';
import { publishDueOutboxEvents } from '@/lib/events/outbox';
import { inngest } from '@/lib/inngest/client';
import { createServiceClient } from '@/lib/supabase/service';
import { bookAppointment } from '../book';
import { cancelAppointment } from '../cancel';
import { AppointmentError } from '../errors';
import { rescheduleAppointment } from '../reschedule';
import { transitionAppointment } from '../state';

let ptId = '';
let patientId = '';
let otherPatientId = '';

const mondayAt = (hour: number, minute = 0) =>
  new Date(
    `2026-07-06T${String(hour - 2).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00.000Z`,
  );
const tuesdayAt = (hour: number) =>
  new Date(`2026-07-07T${String(hour - 2).padStart(2, '0')}:00:00.000Z`);

beforeAll(async () => {
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: `appointments-${Date.now()}@example.com`,
    password: 'appointments-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`createUser failed: ${error?.message}`);
  }
  ptId = data.user.id;
});

beforeEach(async () => {
  await db.delete(patients).where(eq(patients.ptId, ptId));
  await db.delete(availabilityRules).where(eq(availabilityRules.ptId, ptId));
  await db.delete(events).where(eq(events.ptId, ptId));
  await db
    .update(pts)
    .set({ timezone: 'Europe/Tirane' })
    .where(eq(pts.id, ptId));

  const inserted = await db
    .insert(patients)
    .values([
      { ptId, name: 'Alex', phone: `+3556901${Date.now()}` },
      { ptId, name: 'Sam', phone: `+3556902${Date.now()}` },
    ])
    .returning({ id: patients.id });
  patientId = inserted[0].id;
  otherPatientId = inserted[1].id;

  await db.insert(availabilityRules).values([
    {
      ptId,
      weekday: 1,
      startTime: '09:00:00',
      endTime: '17:00:00',
    },
    {
      ptId,
      weekday: 2,
      startTime: '09:00:00',
      endTime: '17:00:00',
    },
  ]);

  vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

describe('appointment mutations', () => {
  it('books once and returns the same appointment on replay', async () => {
    const input = {
      ptId,
      patientId,
      startsAt: mondayAt(9),
      serviceType: 'Initial consultation',
    };

    const first = await bookAppointment(input);
    const replay = await bookAppointment(input);
    expect(replay.id).toBe(first.id);

    const storedAppointments = await db
      .select()
      .from(appointments)
      .where(eq(appointments.ptId, ptId));
    const storedEvents = await db
      .select()
      .from(events)
      .where(eq(events.ptId, ptId));
    const outbox = await db
      .select()
      .from(eventOutbox)
      .where(eq(eventOutbox.ptId, ptId));

    expect(storedAppointments).toHaveLength(1);
    expect(storedEvents).toHaveLength(1);
    expect(storedEvents[0].type).toBe('appointment.booked');
    expect(outbox).toHaveLength(1);
    expect(outbox[0].publishedAt).not.toBeNull();
    expect(inngest.send).toHaveBeenCalledTimes(1);
    expect(inngest.send).toHaveBeenCalledWith(
      expect.objectContaining({
        id: storedEvents[0].id,
        name: 'appointment.booked',
      }),
    );
  });

  it('allows only one of two patients to claim the same slot concurrently', async () => {
    const results = await Promise.allSettled([
      bookAppointment({
        ptId,
        patientId,
        startsAt: mondayAt(10),
        serviceType: 'Treatment',
      }),
      bookAppointment({
        ptId,
        patientId: otherPatientId,
        startsAt: mondayAt(10),
        serviceType: 'Treatment',
      }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected');
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: expect.objectContaining({ code: 'unavailable' }),
    });
  });

  it('rejects direct overlapping active inserts at the database boundary', async () => {
    await db.insert(appointments).values({
      ptId,
      patientId,
      startsAt: mondayAt(9),
      endsAt: mondayAt(10),
      status: 'pending',
    });

    try {
      await db.insert(appointments).values({
        ptId,
        patientId: otherPatientId,
        startsAt: new Date('2026-07-06T07:30:00.000Z'),
        endsAt: new Date('2026-07-06T08:30:00.000Z'),
        status: 'confirmed',
      });
      throw new Error('expected exclusion constraint to reject overlap');
    } catch (error) {
      expect(getPostgresErrorCode(error)).toBe('23P01');
    }
  });

  it('reschedules in place, preserves status, and records from/to times', async () => {
    const booked = await bookAppointment({
      ptId,
      patientId,
      startsAt: mondayAt(11, 15),
      serviceType: 'Treatment',
      durationMinutes: 45,
    });
    const moved = await rescheduleAppointment({
      ptId,
      patientId,
      appointmentId: booked.id,
      newStartsAt: tuesdayAt(12),
    });

    expect(moved.id).toBe(booked.id);
    expect(moved.status).toBe('pending');
    expect(moved.startsAt).toEqual(tuesdayAt(12));
    expect(moved.endsAt).toEqual(
      new Date(tuesdayAt(12).getTime() + 45 * 60_000),
    );

    const rows = await db
      .select()
      .from(events)
      .where(
        and(eq(events.ptId, ptId), eq(events.type, 'appointment.rescheduled')),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({
      appointmentId: booked.id,
      status: 'pending',
      from: { startsAt: mondayAt(11, 15).toISOString() },
      to: { startsAt: tuesdayAt(12).toISOString() },
    });
  });

  it('books and reschedules a 45-minute service on the hourly picker grid', async () => {
    // The pickers offer an hourly grid; a 45-minute service is not a member of
    // it, but every one of those times is genuinely free.
    const booked = await bookAppointment({
      ptId,
      patientId,
      startsAt: mondayAt(11),
      serviceType: 'Vlerësim i parë',
      durationMinutes: 45,
    });
    expect(booked.endsAt).toEqual(
      new Date(mondayAt(11).getTime() + 45 * 60_000),
    );

    const moved = await rescheduleAppointment({
      ptId,
      patientId,
      appointmentId: booked.id,
      newStartsAt: tuesdayAt(13),
    });
    expect(moved.startsAt).toEqual(tuesdayAt(13));
    expect(moved.endsAt).toEqual(
      new Date(tuesdayAt(13).getTime() + 45 * 60_000),
    );
  });

  it('still refuses a booking that runs past the end of the working day', async () => {
    await expect(
      bookAppointment({
        ptId,
        patientId,
        startsAt: mondayAt(16, 30),
        serviceType: 'Vlerësim i parë',
        durationMinutes: 45,
      }),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('cancels with actor and reason metadata', async () => {
    const booked = await bookAppointment({
      ptId,
      patientId,
      startsAt: mondayAt(13),
      serviceType: 'Treatment',
    });
    const cancelled = await cancelAppointment({
      ptId,
      patientId,
      appointmentId: booked.id,
      cancelledBy: 'patient',
      reason: 'Travel',
    });

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledBy).toBe('patient');
    expect(cancelled.cancellationReason).toBe('Travel');
  });

  it('does not move an appointment into an occupied slot', async () => {
    const first = await bookAppointment({
      ptId,
      patientId,
      startsAt: mondayAt(9),
      serviceType: 'Treatment',
    });
    await bookAppointment({
      ptId,
      patientId: otherPatientId,
      startsAt: mondayAt(10),
      serviceType: 'Treatment',
    });

    await expect(
      rescheduleAppointment({
        ptId,
        patientId,
        appointmentId: first.id,
        newStartsAt: mondayAt(10),
      }),
    ).rejects.toMatchObject({ code: 'unavailable' });

    const [unchanged] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, first.id));
    expect(unchanged.startsAt).toEqual(mondayAt(9));
  });

  it('allows pending appointments to close as no-show and rejects terminal changes', async () => {
    const booked = await bookAppointment({
      ptId,
      patientId,
      startsAt: mondayAt(14),
      serviceType: 'Treatment',
    });
    const noShow = await transitionAppointment({
      ptId,
      appointmentId: booked.id,
      nextStatus: 'no_show',
    });
    expect(noShow.status).toBe('no_show');

    await expect(
      transitionAppointment({
        ptId,
        appointmentId: booked.id,
        nextStatus: 'confirmed',
      }),
    ).rejects.toBeInstanceOf(AppointmentError);

    const [stored] = await db
      .select()
      .from(appointments)
      .where(eq(appointments.id, booked.id));
    expect(stored.status).toBe('no_show');
  });

  it('keeps a failed publication durable and retries it later', async () => {
    vi.mocked(inngest.send).mockRejectedValueOnce(new Error('temporary'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await bookAppointment({
      ptId,
      patientId,
      startsAt: mondayAt(15),
      serviceType: 'Treatment',
    });

    const [failed] = await db
      .select()
      .from(eventOutbox)
      .where(eq(eventOutbox.ptId, ptId));
    expect(failed.publishedAt).toBeNull();
    expect(failed.attempts).toBe(1);
    expect(failed.lastError).toContain('temporary');

    await db
      .update(eventOutbox)
      .set({
        availableAt: new Date(0),
        lockedAt: new Date(Date.now() - 10 * 60_000),
      })
      .where(eq(eventOutbox.id, failed.id));
    vi.mocked(inngest.send).mockResolvedValue({ ids: [] } as never);

    await expect(publishDueOutboxEvents()).resolves.toEqual({
      claimed: 1,
      published: 1,
      failed: 0,
    });

    const [published] = await db
      .select()
      .from(eventOutbox)
      .where(eq(eventOutbox.id, failed.id));
    expect(published.publishedAt).not.toBeNull();
    expect(published.attempts).toBe(2);
  });
});
