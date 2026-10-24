import { asc, eq } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { getFreeSlots } from '@/lib/appointments/availability';
import { db } from '@/lib/db';
import { accounts, availabilityRules, services } from '@/lib/db/schema';
import { t } from '@/lib/i18n';
import { createServiceClient } from '@/lib/supabase/service';
import { DAY, testNow, zonedTime } from '@/tests/support/clock';

const { getUserMock, headersMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  headersMock: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: headersMock }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith('REDIRECT:')) {
      throw error;
    }
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser: getUserMock } }),
}));

import { draftToRules, defaultDraft } from '@/lib/onboarding/availability';
import { loadFlowFacts } from '@/lib/onboarding/flow-state';
import { saveAvailabilityStep, type AvailabilityInput } from '../actions';
import { loadAvailabilityDraft } from '../load';

const a = t.onboarding.availability;
const TZ = 'Europe/Tirane';
const NEXT = { ok: true, next: '/onboarding/whatsapp' };

let accountId = '';

const r = (weekday: number, start: string, end: string) => ({
  weekday,
  start,
  end,
});
const weekdays = (start = '09:00', end = '17:00') =>
  [1, 2, 3, 4, 5].map((w) => r(w, start, end));
const input = (
  rules: AvailabilityInput['rules'],
  timezone = TZ,
): AvailabilityInput => ({ timezone, rules });

async function rules() {
  return db
    .select({
      weekday: availabilityRules.weekday,
      startTime: availabilityRules.startTime,
      endTime: availabilityRules.endTime,
    })
    .from(availabilityRules)
    .where(eq(availabilityRules.accountId, accountId))
    .orderBy(asc(availabilityRules.weekday), asc(availabilityRules.startTime));
}
const asInputs = (rows: Awaited<ReturnType<typeof rules>>) =>
  rows.map((x) => r(x.weekday, x.startTime.slice(0, 5), x.endTime.slice(0, 5)));

async function timezone() {
  const [row] = await db
    .select({ timezone: accounts.timezone })
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return row.timezone;
}

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `onboarding-availability-${Date.now()}@example.com`,
    password: 'onboarding-avail-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Missing user');
  accountId = data.user.id;
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

beforeEach(async () => {
  getUserMock.mockResolvedValue({ data: { user: { id: accountId } } });
  headersMock.mockResolvedValue(new Headers());
  await db
    .update(accounts)
    .set({
      onboardingFlow: 'guided',
      name: 'Studio Vita',
      businessType: 'beauty_salon',
      city: 'Tiranë',
      address: 'Rruga 1',
      timezone: TZ,
      onboardingIntroSeenAt: new Date(),
      onboardingWhatsappSeenAt: null,
      onboardingNotificationsSeenAt: null,
      onboardingCompletedAt: null,
    })
    .where(eq(accounts.id, accountId));
  await db.delete(services).where(eq(services.accountId, accountId));
  await db.insert(services).values({
    accountId,
    name: 'Manikyr',
    durationMin: 60,
    priceLek: 2500,
    mode: 'at_business',
    description: 'Manikyr me xhel',
  });
  await db
    .delete(availabilityRules)
    .where(eq(availabilityRules.accountId, accountId));
});

const MIXED = [
  r(1, '09:00', '17:00'),
  r(3, '12:00', '20:00'),
  r(5, '09:00', '14:00'),
];

describe('saveAvailabilityStep: saving', () => {
  it('saves the default week and keeps the timezone', async () => {
    await expect(saveAvailabilityStep(input(weekdays()))).resolves.toEqual(
      NEXT,
    );
    const rows = await rules();
    expect(rows).toHaveLength(5);
    expect(rows.every((x) => x.startTime === '09:00:00')).toBe(true);
    expect(await timezone()).toBe(TZ);
    expect((await loadFlowFacts(accountId)).availability).toBe(true);
  });

  it('saves per-day hours', async () => {
    await expect(saveAvailabilityStep(input(MIXED))).resolves.toEqual(NEXT);
    expect(asInputs(await rules())).toEqual(MIXED);
  });

  it('replaces the rules instead of appending', async () => {
    await saveAvailabilityStep(input(weekdays()));
    await saveAvailabilityStep(input(MIXED));
    expect(asInputs(await rules())).toEqual(MIXED);
  });

  it('a double submit leaves exactly one set of rows, never a mix', async () => {
    const both = await Promise.all([
      saveAvailabilityStep(input(weekdays())),
      saveAvailabilityStep(input(weekdays())),
    ]);
    expect(both).toEqual([NEXT, NEXT]);
    expect(await rules()).toHaveLength(5);

    const raced = await Promise.all([
      saveAvailabilityStep(input(weekdays())),
      saveAvailabilityStep(input(MIXED)),
    ]);
    expect(raced).toEqual([NEXT, NEXT]);
    const after = asInputs(await rules());
    expect([weekdays(), MIXED]).toContainEqual(after);
  });

  it('saves the timezone', async () => {
    await saveAvailabilityStep(input(weekdays(), 'Europe/Rome'));
    expect(await timezone()).toBe('Europe/Rome');
  });
});

describe('saveAvailabilityStep: validation', () => {
  it('end before or equal to start: error on the day, rows unchanged', async () => {
    await saveAvailabilityStep(input(weekdays()));
    for (const bad of [r(3, '17:00', '09:00'), r(3, '09:00', '09:00')]) {
      await expect(saveAvailabilityStep(input([bad]))).resolves.toEqual({
        ok: false,
        fieldErrors: { 'day-3': t.availability.endAfterStart },
        reason: a.fixHours,
      });
    }
    expect(asInputs(await rules())).toEqual(weekdays());
  });

  it('no day selected', async () => {
    await expect(saveAvailabilityStep(input([]))).resolves.toMatchObject({
      ok: false,
      fieldErrors: { days: a.noDay },
    });
    expect(await rules()).toHaveLength(0);
  });

  it('overlapping ranges', async () => {
    await expect(
      saveAvailabilityStep(
        input([r(1, '09:00', '13:00'), r(1, '12:00', '17:00')]),
      ),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: { 'day-1': a.overlap },
    });
    expect(await rules()).toHaveLength(0);
  });

  it('an empty time', async () => {
    await expect(
      saveAvailabilityStep(input([r(2, '', '17:00')])),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: { 'day-2': a.timeMissing },
    });
  });

  it('an invalid timezone changes neither rules nor timezone', async () => {
    await saveAvailabilityStep(input(weekdays()));
    await expect(
      saveAvailabilityStep(input(MIXED, 'Mars/Phobos')),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: { timezone: a.timezoneInvalid },
    });
    expect(asInputs(await rules())).toEqual(weekdays());
    expect(await timezone()).toBe(TZ);
  });

  it('null or malformed input returns a result and writes nothing', async () => {
    await expect(saveAvailabilityStep(null as never)).resolves.toMatchObject({
      ok: false,
    });
    await expect(
      saveAvailabilityStep({ timezone: TZ, rules: 'x' } as never),
    ).resolves.toMatchObject({ ok: false, reason: a.fixHours });
    expect(await rules()).toHaveLength(0);
  });
});

describe('loadAvailabilityDraft', () => {
  it('no rules gives the suggestion', async () => {
    expect(await loadAvailabilityDraft(accountId)).toEqual(defaultDraft(TZ));
  });

  it('reproduces saved rules and timezone', async () => {
    await saveAvailabilityStep(input(MIXED, 'Europe/Rome'));
    const draft = await loadAvailabilityDraft(accountId);
    expect(draft.timezone).toBe('Europe/Rome');
    expect(draftToRules(draft)).toEqual(MIXED);
  });

  it('uses the earliest of two Monday rows', async () => {
    await db.insert(availabilityRules).values([
      { accountId, weekday: 1, startTime: '14:00:00', endTime: '18:00:00' },
      { accountId, weekday: 1, startTime: '09:00:00', endTime: '12:00:00' },
    ]);
    const draft = await loadAvailabilityDraft(accountId);
    expect(draft.days[1]).toEqual({ open: true, start: '09:00', end: '12:00' });
  });
});

describe('engine', () => {
  it('offers slots only inside the saved hours', async () => {
    await saveAvailabilityStep(input(MIXED));
    const monday = new Date(testNow({ weekday: 1 }).getTime() + 7 * DAY);
    const day = (offset: number) => new Date(monday.getTime() + offset * DAY);
    const wed = await getFreeSlots({
      accountId,
      start: zonedTime(day(2), 0),
      end: zonedTime(day(3), 0),
      durationMinutes: 60,
    });
    expect(wed.slots.map((s) => s.startsAt)).toEqual(
      [12, 13, 14, 15, 16, 17, 18, 19].map((h) =>
        zonedTime(day(2), h).toISOString(),
      ),
    );
    const sat = await getFreeSlots({
      accountId,
      start: zonedTime(day(5), 0),
      end: zonedTime(day(6), 0),
      durationMinutes: 60,
    });
    expect(sat.slots).toEqual([]);
  });
});

describe('guard', () => {
  it('a legacy account is redirected', async () => {
    await db
      .update(accounts)
      .set({ onboardingFlow: 'legacy' })
      .where(eq(accounts.id, accountId));
    await expect(saveAvailabilityStep(input(weekdays()))).rejects.toThrow(
      /^REDIRECT:/,
    );
  });

  it('a completed account is redirected', async () => {
    await db
      .update(accounts)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(accounts.id, accountId));
    await expect(saveAvailabilityStep(input(weekdays()))).rejects.toThrow(
      /^REDIRECT:/,
    );
  });
});
