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
import { accounts, availabilityRules } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';

const { getUserMock } = vi.hoisted(() => ({ getUserMock: vi.fn() }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
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

import { markSeenAndAdvance, goToDashboard } from '../actions';
import { saveAvailabilityPlaceholder } from '../availability/actions';
import { saveBusiness, type BusinessInput } from '../business/actions';

let accountId = '';

const valid: BusinessInput = {
  name: '  Studio Vita ',
  businessType: 'beauty_salon',
  fullName: ' Elira Hoxha ',
  title: 'Manikyriste',
  tagline: 'Manikyr në Tiranë.',
};

async function row() {
  const [r] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return r;
}

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `onboarding-actions-${Date.now()}@example.com`,
    password: 'onboarding-actions-pass-1234',
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
  await db
    .update(accounts)
    .set({
      onboardingFlow: 'guided',
      name: null,
      businessType: null,
      fullName: null,
      title: null,
      tagline: null,
      address: null,
      onboardingIntroSeenAt: null,
      onboardingWhatsappSeenAt: null,
      onboardingNotificationsSeenAt: null,
      onboardingCompletedAt: null,
    })
    .where(eq(accounts.id, accountId));
  await db
    .delete(availabilityRules)
    .where(eq(availabilityRules.accountId, accountId));
});

describe('placeholder step actions are safe to repeat', () => {
  it('availability: concurrent calls leave one set of five rules', async () => {
    await Promise.all([
      saveAvailabilityPlaceholder(),
      saveAvailabilityPlaceholder(),
    ]);
    const rules = await db
      .select({ id: availabilityRules.id })
      .from(availabilityRules)
      .where(eq(availabilityRules.accountId, accountId));
    expect(rules).toHaveLength(5);
  });

  it('seen steps: concurrent calls keep the first timestamp', async () => {
    await markSeenAndAdvance('whatsapp', 'skipped');
    const first = (await row()).onboardingWhatsappSeenAt;
    await Promise.all([
      markSeenAndAdvance('whatsapp', 'skipped'),
      markSeenAndAdvance('whatsapp', 'skipped'),
    ]);
    expect((await row()).onboardingWhatsappSeenAt?.getTime()).toBe(
      first?.getTime(),
    );
  });
});

describe('saveBusiness', () => {
  it('writes every value and moves on once the intro is seen', async () => {
    await db
      .update(accounts)
      .set({ onboardingIntroSeenAt: new Date() })
      .where(eq(accounts.id, accountId));
    await expect(saveBusiness(valid)).resolves.toEqual({
      ok: true,
      next: '/onboarding/services',
    });
    expect(await row()).toMatchObject({
      name: 'Studio Vita',
      businessType: 'beauty_salon',
      fullName: 'Elira Hoxha',
      title: 'Manikyriste',
      tagline: 'Manikyr në Tiranë.',
    });
  });

  it('double submit: both succeed and one row holds the values', async () => {
    const results = await Promise.all([
      saveBusiness(valid),
      saveBusiness(valid),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await row()).toMatchObject({
      name: 'Studio Vita',
      businessType: 'beauty_salon',
    });
  });

  it('saves empty optional fields as NULL and clears a stored title', async () => {
    await db
      .update(accounts)
      .set({ title: 'Old', tagline: 'Old', fullName: 'Old' })
      .where(eq(accounts.id, accountId));
    await saveBusiness({
      ...valid,
      fullName: '',
      title: '  ',
      tagline: '',
    });
    expect(await row()).toMatchObject({
      fullName: null,
      title: null,
      tagline: null,
    });
  });

  it('a missing name is a field error with the singular reason', async () => {
    await expect(saveBusiness({ ...valid, name: '  ' })).resolves.toEqual({
      ok: false,
      fieldErrors: { name: 'Shkruaj emrin e biznesit.' },
      reason: 'Plotëso fushën e shënuar për të vazhduar.',
    });
    expect((await row()).name).toBeNull();
  });

  it('a missing type is a field error', async () => {
    await expect(
      saveBusiness({ ...valid, businessType: null }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: { businessType: 'Zgjidh llojin e biznesit.' },
      reason: 'Plotëso fushën e shënuar për të vazhduar.',
    });
    expect((await row()).name).toBeNull();
  });

  it('both missing: both errors and the shell default reason', async () => {
    const result = await saveBusiness({
      ...valid,
      name: '',
      businessType: null,
    });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {
        name: expect.any(String),
        businessType: expect.any(String),
      },
    });
    expect(result.ok === false && result.reason).toBeUndefined();
  });

  it.each(['barber', 'Berber', 'tjeter', '', 'x'.repeat(500)])(
    'rejects the unknown type %j without writing or throwing',
    async (value) => {
      await expect(
        saveBusiness({ ...valid, businessType: value }),
      ).resolves.toMatchObject({
        ok: false,
        fieldErrors: { businessType: expect.any(String) },
      });
      const r = await row();
      expect(r.name).toBeNull();
      expect(r.businessType).toBeNull();
    },
  );

  it('an over-long optional field gets the Albanian message', async () => {
    await expect(
      saveBusiness({ ...valid, tagline: 'x'.repeat(161) }),
    ).resolves.toMatchObject({
      ok: false,
      fieldErrors: { tagline: 'Teksti është shumë i gjatë.' },
    });
  });
});

describe('advancing', () => {
  it('the intro marks itself seen and goes to business', async () => {
    await expect(markSeenAndAdvance('intro', 'completed')).resolves.toEqual({
      ok: true,
      next: '/onboarding/business',
    });
  });

  it('Start pressed again keeps the first intro timestamp', async () => {
    await markSeenAndAdvance('intro', 'completed');
    const first = (await row()).onboardingIntroSeenAt;
    expect(first).not.toBeNull();
    await expect(markSeenAndAdvance('intro', 'completed')).resolves.toEqual({
      ok: true,
      next: '/onboarding/business',
    });
    expect((await row()).onboardingIntroSeenAt).toEqual(first);
  });
});

describe('validation', () => {
  it('rejects an unknown step or outcome', async () => {
    await expect(markSeenAndAdvance('business', 'completed')).rejects.toThrow();
    await expect(markSeenAndAdvance('intro', 'nope')).rejects.toThrow();
  });

  it('only the seen steps are accepted, so required data is never skipped', async () => {
    await expect(
      markSeenAndAdvance('availability', 'skipped'),
    ).rejects.toThrow();
    const rules = await db
      .select({ id: availabilityRules.id })
      .from(availabilityRules)
      .where(and(eq(availabilityRules.accountId, accountId)));
    expect(rules).toHaveLength(0);
  });
});

describe('who may save', () => {
  it('redirects a legacy account', async () => {
    await db
      .update(accounts)
      .set({ onboardingFlow: 'legacy' })
      .where(eq(accounts.id, accountId));
    await expect(saveBusiness(valid)).rejects.toThrow('REDIRECT:/onboarding');
  });

  it('redirects a completed account', async () => {
    await db
      .update(accounts)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(accounts.id, accountId));
    await expect(saveBusiness(valid)).rejects.toThrow('REDIRECT:/today');
  });

  it('goToDashboard replaces the history entry', async () => {
    await expect(goToDashboard()).resolves.toEqual({
      ok: true,
      next: '/today',
      replace: true,
    });
  });
});
