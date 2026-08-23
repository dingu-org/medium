import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  appointments,
  availabilityRules,
  blockedPeriods,
  customers,
  accounts,
} from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { DAY, testNow, zonedTime } from '@/tests/support/clock';
import { getFreeSlots, isSlotBookable } from '../availability';

// Availability rules are stored per weekday as local wall times, so the fixtures
// need real weekdays — derived, a week out, and resolved through `zonedTime` so
// they read the same in CET and CEST.
const MONDAY = new Date(testNow({ weekday: 1 }).getTime() + 7 * DAY);
const TUESDAY = new Date(MONDAY.getTime() + DAY);
const SUNDAY = new Date(MONDAY.getTime() - DAY);
const mondayAt = (hour: number, minute = 0) => zonedTime(MONDAY, hour, minute);
const tuesdayAt = (hour: number, minute = 0) => zonedTime(TUESDAY, hour, minute);
const sundayAt = (hour: number, minute = 0) => zonedTime(SUNDAY, hour, minute);

let accountId = '';
let customerId = '';

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
  accountId = data.user.id;
});

beforeEach(async () => {
  await db.delete(customers).where(eq(customers.accountId, accountId));
  await db.delete(availabilityRules).where(eq(availabilityRules.accountId, accountId));
  await db.delete(blockedPeriods).where(eq(blockedPeriods.accountId, accountId));
  await db
    .update(accounts)
    .set({ timezone: 'Europe/Tirane' })
    .where(eq(accounts.id, accountId));

  const [customer] = await db
    .insert(customers)
    .values({ accountId, name: 'Alex', phone: `+35569${Date.now()}` })
    .returning({ id: customers.id });
  customerId = customer.id;
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

describe('getFreeSlots', () => {
  it('subtracts blocked periods and active appointments from weekly rules', async () => {
    await db.insert(availabilityRules).values({
      accountId,
      weekday: 1,
      startTime: '09:00:00',
      endTime: '13:00:00',
    });
    await db.insert(blockedPeriods).values({
      accountId,
      startsAt: mondayAt(10),
      endsAt: mondayAt(11),
      label: 'Admin',
    });
    await db.insert(appointments).values({
      accountId,
      customerId,
      startsAt: mondayAt(11),
      endsAt: mondayAt(12),
      status: 'confirmed',
    });

    const result = await getFreeSlots({
      accountId,
      start: mondayAt(9),
      end: mondayAt(13),
      durationMinutes: 60,
    });

    expect(result).toEqual({
      timezone: 'Europe/Tirane',
      slots: [
        {
          startsAt: mondayAt(9).toISOString(),
          endsAt: mondayAt(10).toISOString(),
        },
        {
          startsAt: mondayAt(12).toISOString(),
          endsAt: mondayAt(13).toISOString(),
        },
      ],
    });
  });

  it('returns no slots when the practice has no availability rules', async () => {
    await expect(
      getFreeSlots({
        accountId,
        start: mondayAt(9),
        end: tuesdayAt(9),
      }),
    ).resolves.toEqual({ timezone: 'Europe/Tirane', slots: [] });
  });

  /*
   * DELIBERATE EXCEPTION to "no absolute dates in tests" — the next two cases,
   * and the spring-forward case in `isSlotBookable` below, are the only ones in
   * the suite that keep literal instants.
   *
   * Here the instant IS the subject. 2026-03-29 is the night Europe/Berlin skips
   * 02:00→03:00 and 2026-10-25 the night it repeats 02:00→03:00; a derived date
   * would land on an ordinary day and the test would pass while asserting
   * nothing. These cannot rot either: `getFreeSlots` never reads the wall clock
   * (the window is a parameter), so the answer is the same on any run date —
   * verified by running the whole suite under a clock shifted 400 days forward.
   * The only maintenance they need is a fresh transition date if the year is
   * ever changed, which is exactly what the comments below name.
   */

  // 2026-03-29: Europe/Berlin jumps 02:00 → 03:00, so 02:00–03:00 local does
  // not exist and the first bookable hour of the rule is 03:00 CEST.
  it('skips a nonexistent spring-forward wall time', async () => {
    await db
      .update(accounts)
      .set({ timezone: 'Europe/Berlin' })
      .where(eq(accounts.id, accountId));
    await db.insert(availabilityRules).values({
      accountId,
      weekday: 0,
      startTime: '02:00:00',
      endTime: '04:00:00',
    });

    const result = await getFreeSlots({
      accountId,
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

  // 2026-10-25: Europe/Berlin repeats 02:00 → 03:00, so the same wall hour has
  // two instants and only one of them may be offered.
  it('returns one usable occurrence of a duplicated fall-back wall time', async () => {
    await db
      .update(accounts)
      .set({ timezone: 'Europe/Berlin' })
      .where(eq(accounts.id, accountId));
    await db.insert(availabilityRules).values({
      accountId,
      weekday: 0,
      startTime: '02:00:00',
      endTime: '04:00:00',
    });

    const result = await getFreeSlots({
      accountId,
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
      accountId,
      weekday: 2,
      startTime: '09:00:00',
      endTime: '10:00:00',
    });

    const result = await getFreeSlots({
      accountId,
      start: mondayAt(23, 30),
      end: tuesdayAt(11),
    });

    expect(result.slots).toEqual([
      {
        startsAt: tuesdayAt(9).toISOString(),
        endsAt: tuesdayAt(10).toISOString(),
      },
    ]);
  });

  it('supports an availability rule ending at 24:00', async () => {
    await db.insert(availabilityRules).values({
      accountId,
      weekday: 1,
      startTime: '23:00:00',
      endTime: '24:00:00',
    });

    const result = await getFreeSlots({
      accountId,
      start: mondayAt(22),
      end: tuesdayAt(0),
    });

    expect(result.slots).toEqual([
      {
        startsAt: mondayAt(23).toISOString(),
        endsAt: tuesdayAt(0).toISOString(),
      },
    ]);
  });
});

const workingMonday = () =>
  db.insert(availabilityRules).values({
    accountId,
    weekday: 1,
    startTime: '09:00:00',
    endTime: '17:00:00',
  });

describe('isSlotBookable', () => {
  it('accepts a 45-minute slot that no hourly offer grid contains', async () => {
    await workingMonday();

    await expect(
      isSlotBookable({
        accountId,
        startsAt: mondayAt(11),
        endsAt: mondayAt(11, 45),
      }),
    ).resolves.toBe(true);
  });

  it('accepts a slot ending exactly when the working rule ends', async () => {
    await workingMonday();

    await expect(
      isSlotBookable({
        accountId,
        startsAt: mondayAt(16, 15),
        endsAt: mondayAt(17), // exactly when the rule ends
      }),
    ).resolves.toBe(true);
  });

  it('rejects a slot that runs past the end of the working rule', async () => {
    await workingMonday();

    await expect(
      isSlotBookable({
        accountId,
        startsAt: mondayAt(16, 30),
        endsAt: mondayAt(17, 15), // past the end of the rule
      }),
    ).resolves.toBe(false);
  });

  it('rejects a slot spanning two adjacent rules and days without rules', async () => {
    await db.insert(availabilityRules).values([
      { accountId, weekday: 1, startTime: '09:00:00', endTime: '12:00:00' },
      { accountId, weekday: 1, startTime: '12:00:00', endTime: '17:00:00' },
    ]);

    await expect(
      isSlotBookable({
        accountId,
        startsAt: mondayAt(11, 45),
        endsAt: mondayAt(12, 30), // spans the seam between the two rules
      }),
    ).resolves.toBe(false);
    await expect(
      isSlotBookable({
        accountId,
        startsAt: sundayAt(11), // Sunday: no rule at all
        endsAt: sundayAt(11, 45),
      }),
    ).resolves.toBe(false);
  });

  // Europe/Tirane skips 02:00 → 03:00 on the last Sunday of March — 2026-03-29.
  // A rule whose edge lands in that gap is still a working day: dropping it
  // would close the practice from 03:00 to 10:00 on the one Sunday a year the
  // clock jumps. Literal for the same reason as the two cases above: the
  // transition instant is the subject, and nothing here reads the wall clock.
  it('keeps a rule that starts inside the spring-forward gap', async () => {
    await db.insert(availabilityRules).values({
      accountId,
      weekday: 0,
      startTime: '02:00:00',
      endTime: '10:00:00',
    });

    await expect(
      isSlotBookable({
        accountId,
        startsAt: new Date('2026-03-29T07:00:00.000Z'), // 09:00 CEST
        endsAt: new Date('2026-03-29T08:00:00.000Z'), // 10:00 CEST
      }),
    ).resolves.toBe(true);
    // The gap itself still has no bookable instant before the clock jumps.
    await expect(
      isSlotBookable({
        accountId,
        startsAt: new Date('2026-03-29T00:30:00.000Z'), // 01:30 CET
        endsAt: new Date('2026-03-29T01:30:00.000Z'), // 03:30 CEST
      }),
    ).resolves.toBe(false);
  });

  it('rejects overlaps with blocked periods and keeps its own appointment out of the way', async () => {
    await workingMonday();
    await db.insert(blockedPeriods).values({
      accountId,
      startsAt: mondayAt(11, 30),
      endsAt: mondayAt(12),
      label: 'Admin',
    });
    const [appointment] = await db
      .insert(appointments)
      .values({
        accountId,
        customerId,
        startsAt: mondayAt(13),
        endsAt: mondayAt(14),
        status: 'confirmed',
      })
      .returning({ id: appointments.id });

    await expect(
      isSlotBookable({
        accountId,
        startsAt: mondayAt(11),
        endsAt: mondayAt(11, 45),
      }),
    ).resolves.toBe(false);
    await expect(
      isSlotBookable({
        accountId,
        startsAt: mondayAt(13, 15),
        endsAt: mondayAt(14),
      }),
    ).resolves.toBe(false);
    await expect(
      isSlotBookable({
        accountId,
        startsAt: mondayAt(13, 15),
        endsAt: mondayAt(14),
        excludeAppointmentId: appointment.id,
      }),
    ).resolves.toBe(true);
  });
});
