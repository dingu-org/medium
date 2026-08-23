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
  customers,
  accounts,
} from '@/lib/db/schema';
import { publishDueOutboxEvents } from '@/lib/events/outbox';
import { inngest } from '@/lib/inngest/client';
import { createServiceClient } from '@/lib/supabase/service';
import { bookAppointment } from '../book';
import { cancelAppointment } from '../cancel';
import { AppointmentError } from '../errors';
import { rescheduleAppointment } from '../reschedule';
import { transitionAppointment } from '../state';
import { DAY, testNow, zonedTime } from '@/tests/support/clock';
import { excludeForeignRows } from '@/tests/support/isolation';

let accountId = '';
let customerId = '';
let otherCustomerId = '';

// The availability rules below are keyed by weekday, so the fixtures need a
// real Monday and Tuesday — derived, and a week out so every booking is in the
// future. `zonedTime` resolves the local wall time properly instead of the old
// `hour - 2`, which quietly assumed the anchor was always in summer time.
const MONDAY = new Date(testNow({ weekday: 1 }).getTime() + 7 * DAY);
const TUESDAY = new Date(MONDAY.getTime() + DAY);
const mondayAt = (hour: number, minute = 0) => zonedTime(MONDAY, hour, minute);
const tuesdayAt = (hour: number) => zonedTime(TUESDAY, hour);

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
  accountId = data.user.id;
});

beforeEach(async () => {
  await db.delete(customers).where(eq(customers.accountId, accountId));
  await db.delete(availabilityRules).where(eq(availabilityRules.accountId, accountId));
  await db.delete(events).where(eq(events.accountId, accountId));
  // `publishDueOutboxEvents` scans the whole table, so the tally it returns
  // counts every tenant's due row, not just this suite's. Park the foreign ones
  // as already published so the claim below can only find what this test wrote.
  await excludeForeignRows(eventOutbox, accountId, { publishedAt: new Date() });
  await db
    .update(accounts)
    .set({ timezone: 'Europe/Tirane' })
    .where(eq(accounts.id, accountId));

  const inserted = await db
    .insert(customers)
    .values([
      { accountId, name: 'Alex', phone: `+3556901${Date.now()}` },
      { accountId, name: 'Sam', phone: `+3556902${Date.now()}` },
    ])
    .returning({ id: customers.id });
  customerId = inserted[0].id;
  otherCustomerId = inserted[1].id;

  await db.insert(availabilityRules).values([
    {
      accountId,
      weekday: 1,
      startTime: '09:00:00',
      endTime: '17:00:00',
    },
    {
      accountId,
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
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

describe('appointment mutations', () => {
  it('books once and returns the same appointment on replay', async () => {
    const input = {
      accountId,
      customerId,
      startsAt: mondayAt(9),
      serviceType: 'Initial consultation',
    };

    const first = await bookAppointment(input);
    const replay = await bookAppointment(input);
    expect(replay.id).toBe(first.id);

    const storedAppointments = await db
      .select()
      .from(appointments)
      .where(eq(appointments.accountId, accountId));
    const storedEvents = await db
      .select()
      .from(events)
      .where(eq(events.accountId, accountId));
    const outbox = await db
      .select()
      .from(eventOutbox)
      .where(eq(eventOutbox.accountId, accountId));

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

  // The consumer of these payloads decides whether to speak to the customer, so
  // the origin has to survive the write — it is not derivable from the row.
  it('records the origin of each change in its event payload', async () => {
    const booked = await bookAppointment({
      accountId,
      customerId,
      startsAt: mondayAt(9),
      serviceType: 'Treatment',
      origin: 'conversation',
    });
    await rescheduleAppointment({
      accountId,
      customerId,
      appointmentId: booked.id,
      newStartsAt: tuesdayAt(9),
      origin: 'account',
    });
    await cancelAppointment({
      accountId,
      customerId,
      appointmentId: booked.id,
      cancelledBy: 'ai',
      origin: 'conversation',
    });

    const rows = await db
      .select({ type: events.type, payload: events.payload })
      .from(events)
      .where(eq(events.accountId, accountId));
    expect(rows).toEqual(
      expect.arrayContaining([
        {
          type: 'appointment.booked',
          payload: expect.objectContaining({ origin: 'conversation' }),
        },
        {
          type: 'appointment.rescheduled',
          payload: expect.objectContaining({ origin: 'account' }),
        },
        {
          type: 'appointment.cancelled',
          payload: expect.objectContaining({
            origin: 'conversation',
            cancelledBy: 'ai',
          }),
        },
      ]),
    );
  });

  it('returns the event it appended, and null when nothing was appended', async () => {
    const input = {
      accountId,
      customerId,
      startsAt: mondayAt(9),
      serviceType: 'Treatment',
      origin: 'conversation' as const,
    };

    const first = await bookAppointment(input);
    const replay = await bookAppointment(input);
    const noop = await rescheduleAppointment({
      accountId,
      customerId,
      appointmentId: first.id,
      newStartsAt: mondayAt(9),
    });

    const [stored] = await db
      .select({ id: events.id })
      .from(events)
      .where(and(eq(events.accountId, accountId), eq(events.type, 'appointment.booked')));
    expect(first.eventId).toBe(stored.id);
    // A replay and a same-time reschedule both return the row unchanged and
    // publish nothing, so neither may claim the event the first call produced.
    expect(replay.eventId).toBeNull();
    expect(noop.eventId).toBeNull();
  });

  it('allows only one of two customers to claim the same slot concurrently', async () => {
    const results = await Promise.allSettled([
      bookAppointment({
        accountId,
        customerId,
        startsAt: mondayAt(10),
        serviceType: 'Treatment',
      }),
      bookAppointment({
        accountId,
        customerId: otherCustomerId,
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
      accountId,
      customerId,
      startsAt: mondayAt(9),
      endsAt: mondayAt(10),
      status: 'pending',
    });

    try {
      await db.insert(appointments).values({
        accountId,
        customerId: otherCustomerId,
        startsAt: mondayAt(9, 30),
        endsAt: mondayAt(10, 30),
        status: 'confirmed',
      });
      throw new Error('expected exclusion constraint to reject overlap');
    } catch (error) {
      expect(getPostgresErrorCode(error)).toBe('23P01');
    }
  });

  it('reschedules in place, preserves status, and records from/to times', async () => {
    const booked = await bookAppointment({
      accountId,
      customerId,
      startsAt: mondayAt(11, 15),
      serviceType: 'Treatment',
      durationMinutes: 45,
    });
    const moved = await rescheduleAppointment({
      accountId,
      customerId,
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
        and(eq(events.accountId, accountId), eq(events.type, 'appointment.rescheduled')),
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
      accountId,
      customerId,
      startsAt: mondayAt(11),
      serviceType: 'Vlerësim i parë',
      durationMinutes: 45,
    });
    expect(booked.endsAt).toEqual(
      new Date(mondayAt(11).getTime() + 45 * 60_000),
    );

    const moved = await rescheduleAppointment({
      accountId,
      customerId,
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
        accountId,
        customerId,
        startsAt: mondayAt(16, 30),
        serviceType: 'Vlerësim i parë',
        durationMinutes: 45,
      }),
    ).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('cancels with actor and reason metadata', async () => {
    const booked = await bookAppointment({
      accountId,
      customerId,
      startsAt: mondayAt(13),
      serviceType: 'Treatment',
    });
    const cancelled = await cancelAppointment({
      accountId,
      customerId,
      appointmentId: booked.id,
      cancelledBy: 'customer',
      reason: 'Travel',
    });

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancelledBy).toBe('customer');
    expect(cancelled.cancellationReason).toBe('Travel');
  });

  it('does not move an appointment into an occupied slot', async () => {
    const first = await bookAppointment({
      accountId,
      customerId,
      startsAt: mondayAt(9),
      serviceType: 'Treatment',
    });
    await bookAppointment({
      accountId,
      customerId: otherCustomerId,
      startsAt: mondayAt(10),
      serviceType: 'Treatment',
    });

    await expect(
      rescheduleAppointment({
        accountId,
        customerId,
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
      accountId,
      customerId,
      startsAt: mondayAt(14),
      serviceType: 'Treatment',
    });
    const noShow = await transitionAppointment({
      accountId,
      appointmentId: booked.id,
      nextStatus: 'no_show',
    });
    expect(noShow.status).toBe('no_show');

    await expect(
      transitionAppointment({
        accountId,
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
      accountId,
      customerId,
      startsAt: mondayAt(15),
      serviceType: 'Treatment',
    });

    const [failed] = await db
      .select()
      .from(eventOutbox)
      .where(eq(eventOutbox.accountId, accountId));
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
      rejected: 0,
      deadLettered: 0,
    });

    const [published] = await db
      .select()
      .from(eventOutbox)
      .where(eq(eventOutbox.id, failed.id));
    expect(published.publishedAt).not.toBeNull();
    expect(published.attempts).toBe(2);
  });
});
