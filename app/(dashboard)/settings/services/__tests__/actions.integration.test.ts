import { createClient } from '@supabase/supabase-js';
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
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { appointments, patients, pts } from '@/lib/db/schema';
import { getServices } from '@/lib/services/queries';
import { createService, deleteService, updateService } from '../actions';
import { MINUTE, testNow } from '@/tests/support/clock';

// Only the existence of an appointment on the service matters here, never its
// date — derived so it stays a plausible upcoming booking forever.
const APPOINTMENT_AT = new Date(testNow().getTime() + 2 * 24 * 60 * MINUTE);

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
// up a real auth user (the trigger creates pts + the three design services).
const realService = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

let ptId = '';

beforeAll(async () => {
  const { data, error } = await realService.auth.admin.createUser({
    email: `services-actions-${Date.now()}@example.com`,
    password: 'services-actions-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
});

afterAll(async () => {
  if (ptId) await realService.auth.admin.deleteUser(ptId);
});

beforeEach(async () => {
  getUserMock.mockResolvedValue({ data: { user: { id: ptId } } });
  // This suite covers create/update/delete behavior, not the Phase 16 C6
  // active-service cap (which is Free-only and has its own plan-gate suite).
  // Grant lifetime Solo so createService isn't capped by the seeded services.
  await db.update(pts).set({ planLifetime: true }).where(eq(pts.id, ptId));
});

afterEach(() => {
  vi.clearAllMocks();
});

async function serviceByName(name: string) {
  const rows = await getServices(ptId);
  return rows.find((row) => row.name === name);
}

describe('createService', () => {
  it('persists an optional price', async () => {
    const result = await createService({
      name: 'Ekografi',
      durationMinutes: 45,
      priceLek: 2500,
    });
    expect(result).toEqual({ ok: true });

    expect(await serviceByName('Ekografi')).toMatchObject({
      name: 'Ekografi',
      durationMinutes: 45,
      priceLek: 2500,
      active: true,
    });
  });

  it('rejects a non-positive price without writing', async () => {
    const zero = await createService({
      name: 'X',
      durationMinutes: 30,
      priceLek: 0,
    });
    expect(zero).toMatchObject({ ok: false, code: 'INVALID' });

    const negative = await createService({
      name: 'X',
      durationMinutes: 30,
      priceLek: -5,
    });
    expect(negative).toMatchObject({ ok: false, code: 'INVALID' });

    expect(await serviceByName('X')).toBeUndefined();
  });
});

describe('updateService', () => {
  it('sets and clears the price', async () => {
    const seeded = await serviceByName('Vlerësim i parë');
    expect(seeded).toBeDefined();

    const set = await updateService(seeded!.id, {
      name: 'Vlerësim i parë',
      durationMinutes: 45,
      priceLek: 3000,
    });
    expect(set).toEqual({ ok: true });
    expect((await serviceByName('Vlerësim i parë'))?.priceLek).toBe(3000);

    const clear = await updateService(seeded!.id, {
      name: 'Vlerësim i parë',
      durationMinutes: 45,
      priceLek: null,
    });
    expect(clear).toEqual({ ok: true });
    expect((await serviceByName('Vlerësim i parë'))?.priceLek).toBeNull();
  });
});

describe('deleteService', () => {
  it('deletes a service no appointment references', async () => {
    const target = await serviceByName('Terapi manuale');
    expect(target).toBeDefined();

    const result = await deleteService(target!.id);
    expect(result).toEqual({ ok: true });
    expect(await serviceByName('Terapi manuale')).toBeUndefined();
  });

  it('blocks deletion when an appointment references the service by name', async () => {
    const target = await serviceByName('Seancë vijuese');
    expect(target).toBeDefined();

    const [patient] = await db
      .insert(patients)
      .values({ ptId, name: 'P', phone: '+355690000000' })
      .returning({ id: patients.id });
    await db.insert(appointments).values({
      ptId,
      patientId: patient.id,
      startsAt: APPOINTMENT_AT,
      endsAt: new Date(APPOINTMENT_AT.getTime() + 30 * MINUTE),
      // Mixed case proves the lower(btrim(...)) name normalization.
      serviceType: 'seancë VIJUESE',
    });

    const result = await deleteService(target!.id);
    expect(result).toMatchObject({ ok: false, code: 'HAS_APPOINTMENTS' });
    expect(await serviceByName('Seancë vijuese')).toBeDefined();
  });

  it('returns NOT_FOUND for an unknown service id', async () => {
    const result = await deleteService(crypto.randomUUID());
    expect(result).toMatchObject({ ok: false, code: 'NOT_FOUND' });
  });
});
