import { and, eq } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { db } from '@/lib/db';
import { accounts, services } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';

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

import { enterScreen } from '@/lib/onboarding/guard';
import { saveServiceStep, type ServiceStepInput } from '../actions';

let accountId = '';
let otherAccountId = '';

const valid: ServiceStepInput = {
  id: null,
  name: 'Manikyr me xhel',
  durationMinutes: 60,
  price: '2 500',
  mode: 'at_business',
  description: 'Manikyr me xhel dhe lyerje.',
  active: true,
};

const FREE_LIMIT = 'Plani falas përfshin një shërbim.';
const FIX_ONE = 'Plotëso fushën e shënuar për të vazhduar.';

async function rows(id = accountId) {
  return db.select().from(services).where(eq(services.accountId, id));
}

async function createUser(label: string): Promise<string> {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `onboarding-services-${label}-${Date.now()}@example.com`,
    password: 'onboarding-services-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Missing user');
  return data.user.id;
}

beforeAll(async () => {
  accountId = await createUser('a');
  otherAccountId = await createUser('b');
});

afterAll(async () => {
  for (const id of [accountId, otherAccountId]) {
    if (id) await createServiceClient().auth.admin.deleteUser(id);
  }
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
      plan: 'free',
      planLifetime: false,
      onboardingIntroSeenAt: new Date(),
      onboardingWhatsappSeenAt: null,
      onboardingNotificationsSeenAt: null,
      onboardingCompletedAt: null,
    })
    .where(eq(accounts.id, accountId));
  await db.delete(services).where(eq(services.accountId, accountId));
  await db.delete(services).where(eq(services.accountId, otherAccountId));
});

describe('saveServiceStep: saving', () => {
  it('writes every field and continues to Where for an at-business service', async () => {
    await expect(saveServiceStep(valid)).resolves.toEqual({
      ok: true,
      next: '/onboarding/where',
    });
    const [row, ...rest] = await rows();
    expect(rest).toHaveLength(0);
    expect(row).toMatchObject({
      name: 'Manikyr me xhel',
      durationMin: 60,
      priceLek: 2500,
      mode: 'at_business',
      description: 'Manikyr me xhel dhe lyerje.',
      active: true,
    });
  });

  it('an online service skips Where: next is Availability, step 4 of 6', async () => {
    await expect(
      saveServiceStep({ ...valid, mode: 'online' }),
    ).resolves.toEqual({ ok: true, next: '/onboarding/availability' });
    await expect(enterScreen('availability')).resolves.toMatchObject({
      progress: { kind: 'step', position: 4, total: 6 },
    });
    await expect(enterScreen('where')).rejects.toThrow(
      'REDIRECT:/onboarding/availability',
    );
  });

  it('double submit with no id leaves exactly one row', async () => {
    const results = await Promise.all([
      saveServiceStep(valid),
      saveServiceStep(valid),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await rows()).toHaveLength(1);
  });

  it('saving twice sequentially by name keeps one row; with the id a rename updates it', async () => {
    await saveServiceStep(valid);
    await expect(
      saveServiceStep({ ...valid, name: ' manikyr ME xhel ', price: '3000' }),
    ).resolves.toMatchObject({ ok: true });
    const [first, ...rest] = await rows();
    expect(rest).toHaveLength(0);
    expect(first.priceLek).toBe(3000);

    await saveServiceStep({ ...valid, id: first.id, name: 'Pedikyr' });
    const after = await rows();
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ id: first.id, name: 'Pedikyr' });
  });

  it("a stale id creates a row; another account's id never touches its row", async () => {
    const [foreign] = await db
      .insert(services)
      .values({ accountId: otherAccountId, name: 'Tjetri', durationMin: 30 })
      .returning();
    const stale = '22222222-2222-4222-8222-222222222222';
    await expect(
      saveServiceStep({ ...valid, id: stale }),
    ).resolves.toMatchObject({ ok: true });
    expect(await rows()).toHaveLength(1);
    await db.delete(services).where(eq(services.accountId, accountId));

    await expect(
      saveServiceStep({ ...valid, id: foreign.id, name: 'Imi' }),
    ).resolves.toMatchObject({ ok: true });
    const [mine] = await rows();
    expect(mine.id).not.toBe(foreign.id);
    const [untouched] = await rows(otherAccountId);
    expect(untouched).toMatchObject({ id: foreign.id, name: 'Tjetri' });
  });

  it('parses grouped prices', async () => {
    for (const price of ['2.500', '2,500', '2500']) {
      await saveServiceStep({ ...valid, price });
      expect((await rows())[0].priceLek).toBe(2500);
    }
  });
});

describe('saveServiceStep: Free limit', () => {
  it('refuses a second service with the plan reason and no upsell', async () => {
    await saveServiceStep(valid);
    const result = await saveServiceStep({ ...valid, name: 'Pedikyr' });
    expect(result).toEqual({ ok: false, reason: FREE_LIMIT });
    expect(JSON.stringify(result)).not.toMatch(/Solo|Kalo/);
    expect(await rows()).toHaveLength(1);
  });

  it('refuses a second service even when the first is hidden', async () => {
    await db.insert(services).values({
      accountId,
      name: 'Fshehur',
      durationMin: 30,
      active: false,
    });
    await expect(saveServiceStep(valid)).resolves.toEqual({
      ok: false,
      reason: FREE_LIMIT,
    });
    expect(await rows()).toHaveLength(1);
  });

  it('allows a second service on a lifetime Solo plan', async () => {
    await db
      .update(accounts)
      .set({ plan: 'solo', planLifetime: true })
      .where(eq(accounts.id, accountId));
    await saveServiceStep(valid);
    await expect(
      saveServiceStep({ ...valid, name: 'Pedikyr' }),
    ).resolves.toMatchObject({ ok: true });
    expect(await rows()).toHaveLength(2);
  });
});

describe('saveServiceStep: validation', () => {
  const cases: [string, Partial<ServiceStepInput>, string, string][] = [
    ['name', { name: '  ' }, 'name', 'Shkruaj emrin e shërbimit.'],
    [
      'duration',
      { durationMinutes: null },
      'duration',
      'Zgjidh sa zgjat shërbimi.',
    ],
    [
      'price',
      { price: '' },
      'price',
      'Shkruaj çmimin. Duhet të jetë më shumë se 0.',
    ],
    ['mode', { mode: null }, 'mode', 'Zgjidh ku bëhet shërbimi.'],
    [
      'description',
      { description: ' ' },
      'description',
      'Shkruaj shkurt çfarë përfshin shërbimi.',
    ],
  ];

  it.each(cases)(
    'missing %s is one field error',
    async (_n, patch, key, text) => {
      await expect(saveServiceStep({ ...valid, ...patch })).resolves.toEqual({
        ok: false,
        fieldErrors: { [key]: text },
        reason: FIX_ONE,
      });
      expect(await rows()).toHaveLength(0);
    },
  );

  it('all five missing: five errors and the plural reason', async () => {
    const result = await saveServiceStep({
      id: null,
      name: '',
      durationMinutes: null,
      price: '',
      mode: null,
      description: '',
      active: true,
    });
    expect(result).toMatchObject({
      ok: false,
      reason: 'Plotëso 5 fushat e shënuara për të vazhduar.',
    });
    expect(
      Object.keys((result as { fieldErrors: object }).fieldErrors).sort(),
    ).toEqual(['description', 'duration', 'mode', 'name', 'price']);
    expect(await rows()).toHaveLength(0);
  });

  it.each(['0', '-1', 'abc', '12.5'])(
    'price %s is a price error',
    async (price) => {
      await expect(saveServiceStep({ ...valid, price })).resolves.toMatchObject(
        {
          ok: false,
          fieldErrors: {
            price: 'Shkruaj çmimin. Duhet të jetë më shumë se 0.',
          },
        },
      );
      expect(await rows()).toHaveLength(0);
    },
  );

  it.each([4, 481, 30.5])('duration %s is a range error', async (minutes) => {
    await expect(
      saveServiceStep({ ...valid, durationMinutes: minutes }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: {
        duration: 'Kohëzgjatja duhet të jetë nga 5 deri në 480 minuta.',
      },
    });
    expect(await rows()).toHaveLength(0);
  });

  it('an unknown mode is a field error, never a throw', async () => {
    await expect(
      saveServiceStep({ ...valid, mode: 'in_person' }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: { mode: 'Zgjidh ku bëhet shërbimi.' },
    });
    expect(await rows()).toHaveLength(0);
  });

  it('over-long text uses the too-long message', async () => {
    await expect(
      saveServiceStep({ ...valid, description: 'a'.repeat(501) }),
    ).resolves.toMatchObject({
      fieldErrors: { description: 'Teksti është shumë i gjatë.' },
    });
  });

  it('hiding the only service is refused', async () => {
    await expect(
      saveServiceStep({ ...valid, active: false }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: {
        active:
          'Të paktën një shërbim duhet të jetë aktiv që klientët të rezervojnë.',
      },
    });
    expect(await rows()).toHaveLength(0);
  });
});

describe('saveServiceStep: continuing without a form', () => {
  it('stays on Services while no service is complete', async () => {
    await expect(saveServiceStep(null)).resolves.toEqual({
      ok: true,
      next: '/onboarding/services',
    });
  });

  it('continues to Where once a complete service exists', async () => {
    await saveServiceStep(valid);
    await expect(saveServiceStep(null)).resolves.toEqual({
      ok: true,
      next: '/onboarding/where',
    });
  });
});

describe('saveServiceStep: account state', () => {
  it('redirects a legacy account', async () => {
    await db
      .update(accounts)
      .set({ onboardingFlow: 'legacy' })
      .where(eq(accounts.id, accountId));
    await expect(saveServiceStep(valid)).rejects.toThrow(
      'REDIRECT:/onboarding',
    );
  });

  it('redirects a completed account', async () => {
    await db
      .update(accounts)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(accounts.id, accountId));
    await expect(saveServiceStep(valid)).rejects.toThrow('REDIRECT:/today');
    expect(
      await db
        .select()
        .from(services)
        .where(and(eq(services.accountId, accountId))),
    ).toHaveLength(0);
  });
});
