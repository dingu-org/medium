import { createClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
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
import { pts } from '@/lib/db/schema';
import { getServices } from '@/lib/services/queries';
import { createService, setServiceActive } from '../actions';

const { getUserMock, redirectMock } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: redirectMock,
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith('REDIRECT:')) {
      throw error;
    }
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser: getUserMock } }),
}));

const realService = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

let ptId = '';

beforeAll(async () => {
  const { data, error } = await realService.auth.admin.createUser({
    email: `services-plan-gate-${Date.now()}@example.com`,
    password: 'services-gate-pass-1234',
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

afterEach(() => vi.clearAllMocks());

describe('services plan gate (Free = 1 active)', () => {
  it('blocks a second active service on Free but allows a swap', async () => {
    // Free by default. Reduce the seeded services to exactly one active.
    let all = await getServices(ptId);
    const active = all.filter((s) => s.active);
    for (const s of active.slice(1)) {
      const r = await setServiceActive(s.id, false);
      expect(r).toEqual({ ok: true });
    }
    all = await getServices(ptId);
    expect(all.filter((s) => s.active)).toHaveLength(1);

    // Creating a second active service is capped.
    const created = await createService({
      name: 'Shërbim i ri',
      durationMinutes: 30,
      priceLek: null,
    });
    expect(created).toMatchObject({ ok: false, code: 'PLAN_LIMIT' });

    // Activating another existing service is also capped...
    const activeOne = all.find((s) => s.active)!;
    const inactiveOne = all.find((s) => !s.active)!;
    const blocked = await setServiceActive(inactiveOne.id, true);
    expect(blocked).toMatchObject({ ok: false, code: 'PLAN_LIMIT' });

    // ...but the swap works: free the slot, then take it.
    expect(await setServiceActive(activeOne.id, false)).toEqual({ ok: true });
    expect(await setServiceActive(inactiveOne.id, true)).toEqual({ ok: true });
    expect((await getServices(ptId)).filter((s) => s.active)).toHaveLength(1);
  });

  it('lifts the cap on an effective Solo plan', async () => {
    // Lifetime → effective Solo (unlimited active services).
    await db
      .update(pts)
      .set({ plan: 'solo', planLifetime: true })
      .where(eq(pts.id, ptId));

    const created = await createService({
      name: 'Shërbim Solo',
      durationMinutes: 30,
      priceLek: null,
    });
    expect(created).toEqual({ ok: true });

    await db
      .update(pts)
      .set({ plan: 'free', planLifetime: false })
      .where(eq(pts.id, ptId));
  });
});
