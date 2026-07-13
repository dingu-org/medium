import { createClient } from '@supabase/supabase-js';
import { asc, eq } from 'drizzle-orm';
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
import { availabilityRules, blockedPeriods, pts } from '@/lib/db/schema';
import { addBlockedPeriod, saveAvailability, saveTimezone } from '../actions';

const { getUserMock, redirectMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  // instrumentedAction (lib/actions/instrument.ts) calls unstable_rethrow
  // before logging/rethrowing; mirror its redirect-passthrough contract so
  // the REDIRECT: sentinel from redirectMock above isn't logged as an error.
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith('REDIRECT:')) {
      throw error;
    }
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: getUserMock },
  }),
}));

// A real service client, independent of the mocks above, purely to seed/clean
// up a real auth user (the trigger creates the pts row) for these tests.
const realService = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

let ptId = '';

beforeAll(async () => {
  const { data, error } = await realService.auth.admin.createUser({
    email: `availability-actions-${Date.now()}@example.com`,
    password: 'availability-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
});

afterAll(async () => {
  if (ptId) await realService.auth.admin.deleteUser(ptId);
});

beforeEach(() => {
  getUserMock.mockResolvedValue({ data: { user: { id: ptId } } });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function readTimezone() {
  const [row] = await db
    .select({ timezone: pts.timezone })
    .from(pts)
    .where(eq(pts.id, ptId))
    .limit(1);
  return row.timezone;
}

describe('saveTimezone', () => {
  it('persists a valid IANA zone', async () => {
    const result = await saveTimezone({ timezone: 'Europe/Tirane' });
    expect(result).toEqual({ ok: true });
    expect(await readTimezone()).toBe('Europe/Tirane');
  });

  it('rejects an invalid zone without writing', async () => {
    await saveTimezone({ timezone: 'Europe/Tirane' });
    const before = await readTimezone();

    const result = await saveTimezone({ timezone: 'Not/AZone' });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
    expect(await readTimezone()).toBe(before);
  });
});

describe('saveAvailability', () => {
  it('replaces all rows on each save', async () => {
    const first = await saveAvailability({
      rules: [
        { weekday: 1, start: '09:00', end: '17:00' },
        { weekday: 2, start: '09:00', end: '17:00' },
      ],
    });
    expect(first).toEqual({ ok: true });

    const second = await saveAvailability({
      rules: [{ weekday: 1, start: '10:00', end: '16:00' }],
    });
    expect(second).toEqual({ ok: true });

    const rows = await db
      .select({ weekday: availabilityRules.weekday })
      .from(availabilityRules)
      .where(eq(availabilityRules.ptId, ptId))
      .orderBy(asc(availabilityRules.weekday));
    expect(rows).toHaveLength(1);
    expect(rows[0].weekday).toBe(1);
  });
});

describe('addBlockedPeriod', () => {
  it('computes the stored instant in the availability-owned timezone', async () => {
    // Europe/Tirane is UTC+2 in July (CEST); the timezone move must keep
    // wall-clock → instant conversion anchored to pts.timezone.
    await saveTimezone({ timezone: 'Europe/Tirane' });

    const result = await addBlockedPeriod({
      date: '2026-07-15',
      startTime: '08:00',
      endTime: '14:00',
    });
    expect(result).toEqual({ ok: true });

    const [row] = await db
      .select({
        startsAt: blockedPeriods.startsAt,
        endsAt: blockedPeriods.endsAt,
      })
      .from(blockedPeriods)
      .where(eq(blockedPeriods.ptId, ptId))
      .limit(1);
    expect(row.startsAt.toISOString()).toBe('2026-07-15T06:00:00.000Z');
    expect(row.endsAt.toISOString()).toBe('2026-07-15T12:00:00.000Z');
    // Row cleanup rides the auth.users delete cascade in afterAll.
  });
});
