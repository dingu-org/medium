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
import { getFreeSlots } from '../availability';

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
