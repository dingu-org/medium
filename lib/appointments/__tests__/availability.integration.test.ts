import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  appointments,
  availabilityRules,
  blockedPeriods,
  patients,
  pts,
} from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { getFreeSlots, isSlotBookable } from '../availability';

let ptId = '';
let patientId = '';

beforeAll(async () => {
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: `availability-${Date.now()}@example.com`,
    password: 'availability-pass-1234',
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
  await db.delete(blockedPeriods).where(eq(blockedPeriods.ptId, ptId));
  await db
    .update(pts)
    .set({ timezone: 'Europe/Tirane' })
    .where(eq(pts.id, ptId));

  const [patient] = await db
    .insert(patients)
    .values({ ptId, name: 'Alex', phone: `+35569${Date.now()}` })
    .returning({ id: patients.id });
  patientId = patient.id;
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

describe('getFreeSlots', () => {
  it('subtracts blocked periods and active appointments from weekly rules', async () => {
    await db.insert(availabilityRules).values({
      ptId,
      weekday: 1,
      startTime: '09:00:00',
      endTime: '13:00:00',
    });
    await db.insert(blockedPeriods).values({
      ptId,
      startsAt: new Date('2026-07-06T08:00:00.000Z'),
      endsAt: new Date('2026-07-06T09:00:00.000Z'),
      label: 'Admin',
    });
    await db.insert(appointments).values({
      ptId,
      patientId,
      startsAt: new Date('2026-07-06T09:00:00.000Z'),
      endsAt: new Date('2026-07-06T10:00:00.000Z'),
      status: 'confirmed',
    });

    const result = await getFreeSlots({
      ptId,
      start: new Date('2026-07-06T07:00:00.000Z'),
      end: new Date('2026-07-06T11:00:00.000Z'),
      durationMinutes: 60,
    });

    expect(result).toEqual({
      timezone: 'Europe/Tirane',
      slots: [
        {
          startsAt: '2026-07-06T07:00:00.000Z',
          endsAt: '2026-07-06T08:00:00.000Z',
        },
        {
          startsAt: '2026-07-06T10:00:00.000Z',
          endsAt: '2026-07-06T11:00:00.000Z',
        },
      ],
    });
  });

  it('returns no slots when the practice has no availability rules', async () => {
    await expect(
      getFreeSlots({
        ptId,
        start: new Date('2026-07-06T07:00:00.000Z'),
        end: new Date('2026-07-07T07:00:00.000Z'),
      }),
    ).resolves.toEqual({ timezone: 'Europe/Tirane', slots: [] });
  });

  it('skips a nonexistent spring-forward wall time', async () => {
    await db
      .update(pts)
      .set({ timezone: 'Europe/Berlin' })
      .where(eq(pts.id, ptId));
    await db.insert(availabilityRules).values({
      ptId,
      weekday: 0,
      startTime: '02:00:00',
      endTime: '04:00:00',
    });

    const result = await getFreeSlots({
      ptId,
      start: new Date('2026-03-29T00:00:00.000Z'),
      end: new Date('2026-03-29T03:00:00.000Z'),
      durationMinutes: 60,
    });

    expect(result.slots).toEqual([
      {
        startsAt: '2026-03-29T01:00:00.000Z',
        endsAt: '2026-03-29T02:00:00.000Z',
      },
    ]);
  });

  it('returns one usable occurrence of a duplicated fall-back wall time', async () => {
    await db
      .update(pts)
      .set({ timezone: 'Europe/Berlin' })
      .where(eq(pts.id, ptId));
    await db.insert(availabilityRules).values({
      ptId,
      weekday: 0,
      startTime: '02:00:00',
      endTime: '04:00:00',
    });

    const result = await getFreeSlots({
      ptId,
      start: new Date('2026-10-24T23:00:00.000Z'),
      end: new Date('2026-10-25T04:00:00.000Z'),
      durationMinutes: 60,
    });

    expect(result.slots).toEqual([
      {
        startsAt: '2026-10-25T01:00:00.000Z',
        endsAt: '2026-10-25T02:00:00.000Z',
      },
      {
        startsAt: '2026-10-25T02:00:00.000Z',
        endsAt: '2026-10-25T03:00:00.000Z',
      },
    ]);
  });

  it('handles a request window crossing local midnight', async () => {
    await db.insert(availabilityRules).values({
      ptId,
      weekday: 2,
      startTime: '09:00:00',
      endTime: '10:00:00',
    });

    const result = await getFreeSlots({
      ptId,
      start: new Date('2026-07-06T21:30:00.000Z'),
      end: new Date('2026-07-07T09:00:00.000Z'),
    });

    expect(result.slots).toEqual([
      {
        startsAt: '2026-07-07T07:00:00.000Z',
        endsAt: '2026-07-07T08:00:00.000Z',
      },
    ]);
  });

  it('supports an availability rule ending at 24:00', async () => {
    await db.insert(availabilityRules).values({
      ptId,
      weekday: 1,
      startTime: '23:00:00',
      endTime: '24:00:00',
    });

    const result = await getFreeSlots({
      ptId,
      start: new Date('2026-07-06T20:00:00.000Z'),
      end: new Date('2026-07-06T22:00:00.000Z'),
    });

    expect(result.slots).toEqual([
      {
        startsAt: '2026-07-06T21:00:00.000Z',
        endsAt: '2026-07-06T22:00:00.000Z',
      },
    ]);
  });
});

// Monday 2026-07-06, Tirane is UTC+2 in July.
const workingMonday = () =>
  db.insert(availabilityRules).values({
    ptId,
    weekday: 1,
    startTime: '09:00:00',
    endTime: '17:00:00',
  });

describe('isSlotBookable', () => {
  it('accepts a 45-minute slot that no hourly offer grid contains', async () => {
    await workingMonday();

    await expect(
      isSlotBookable({
        ptId,
        startsAt: new Date('2026-07-06T09:00:00.000Z'), // 11:00
        endsAt: new Date('2026-07-06T09:45:00.000Z'),
      }),
    ).resolves.toBe(true);
  });

  it('accepts a slot ending exactly when the working rule ends', async () => {
    await workingMonday();

    await expect(
      isSlotBookable({
        ptId,
        startsAt: new Date('2026-07-06T14:15:00.000Z'), // 16:15
        endsAt: new Date('2026-07-06T15:00:00.000Z'), // 17:00
      }),
    ).resolves.toBe(true);
  });

  it('rejects a slot that runs past the end of the working rule', async () => {
    await workingMonday();

    await expect(
      isSlotBookable({
        ptId,
        startsAt: new Date('2026-07-06T14:30:00.000Z'), // 16:30
        endsAt: new Date('2026-07-06T15:15:00.000Z'), // 17:15
      }),
    ).resolves.toBe(false);
  });

  it('rejects a slot spanning two adjacent rules and days without rules', async () => {
    await db.insert(availabilityRules).values([
      { ptId, weekday: 1, startTime: '09:00:00', endTime: '12:00:00' },
      { ptId, weekday: 1, startTime: '12:00:00', endTime: '17:00:00' },
    ]);

    await expect(
      isSlotBookable({
        ptId,
        startsAt: new Date('2026-07-06T09:45:00.000Z'), // 11:45
        endsAt: new Date('2026-07-06T10:30:00.000Z'), // 12:30
      }),
    ).resolves.toBe(false);
    await expect(
      isSlotBookable({
        ptId,
        startsAt: new Date('2026-07-05T09:00:00.000Z'), // Sunday
        endsAt: new Date('2026-07-05T09:45:00.000Z'),
      }),
    ).resolves.toBe(false);
  });

  // Europe/Tirane skips 02:00 → 03:00 on the last Sunday of March. A rule whose
  // edge lands in that gap is still a working day: dropping it would close the
  // practice from 03:00 to 10:00 on the one Sunday a year the clock jumps.
  it('keeps a rule that starts inside the spring-forward gap', async () => {
    await db.insert(availabilityRules).values({
      ptId,
      weekday: 0,
      startTime: '02:00:00',
      endTime: '10:00:00',
    });

    await expect(
      isSlotBookable({
        ptId,
        startsAt: new Date('2026-03-29T07:00:00.000Z'), // 09:00 CEST
        endsAt: new Date('2026-03-29T08:00:00.000Z'), // 10:00 CEST
      }),
    ).resolves.toBe(true);
    // The gap itself still has no bookable instant before the clock jumps.
    await expect(
      isSlotBookable({
        ptId,
        startsAt: new Date('2026-03-29T00:30:00.000Z'), // 01:30 CET
        endsAt: new Date('2026-03-29T01:30:00.000Z'), // 03:30 CEST
      }),
    ).resolves.toBe(false);
  });

  it('rejects overlaps with blocked periods and keeps its own appointment out of the way', async () => {
    await workingMonday();
    await db.insert(blockedPeriods).values({
      ptId,
      startsAt: new Date('2026-07-06T09:30:00.000Z'),
      endsAt: new Date('2026-07-06T10:00:00.000Z'),
      label: 'Admin',
    });
    const [appointment] = await db
      .insert(appointments)
      .values({
        ptId,
        patientId,
        startsAt: new Date('2026-07-06T11:00:00.000Z'),
        endsAt: new Date('2026-07-06T12:00:00.000Z'),
        status: 'confirmed',
      })
      .returning({ id: appointments.id });

    await expect(
      isSlotBookable({
        ptId,
        startsAt: new Date('2026-07-06T09:00:00.000Z'),
        endsAt: new Date('2026-07-06T09:45:00.000Z'),
      }),
    ).resolves.toBe(false);
    await expect(
      isSlotBookable({
        ptId,
        startsAt: new Date('2026-07-06T11:15:00.000Z'),
        endsAt: new Date('2026-07-06T12:00:00.000Z'),
      }),
    ).resolves.toBe(false);
    await expect(
      isSlotBookable({
        ptId,
        startsAt: new Date('2026-07-06T11:15:00.000Z'),
        endsAt: new Date('2026-07-06T12:00:00.000Z'),
        excludeAppointmentId: appointment.id,
      }),
    ).resolves.toBe(true);
  });
});
