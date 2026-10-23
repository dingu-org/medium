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
import { saveBusinessPlaceholder } from '../business/actions';
import { confirmServicesPlaceholder } from '../services/actions';
import { saveWherePlaceholder } from '../where/actions';

let accountId = '';

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
      address: null,
      servicesConfiguredAt: null,
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

  it('business: concurrent calls write the trimmed name', async () => {
    const results = await Promise.all([
      saveBusinessPlaceholder('  Studio Vita '),
      saveBusinessPlaceholder('  Studio Vita '),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    expect((await row()).name).toBe('Studio Vita');
  });

  it('where: concurrent calls write the address', async () => {
    await Promise.all([
      saveWherePlaceholder('Rruga 1'),
      saveWherePlaceholder('Rruga 1'),
    ]);
    expect((await row()).address).toBe('Rruga 1');
  });

  it('services: concurrent calls keep the first confirmation timestamp', async () => {
    await confirmServicesPlaceholder();
    const first = (await row()).servicesConfiguredAt;
    expect(first).not.toBeNull();
    await Promise.all([
      confirmServicesPlaceholder(),
      confirmServicesPlaceholder(),
    ]);
    expect((await row()).servicesConfiguredAt?.getTime()).toBe(
      first?.getTime(),
    );
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

describe('advancing', () => {
  it('services moves on to Where while a mode is unknown', async () => {
    await db
      .update(accounts)
      .set({ onboardingIntroSeenAt: new Date(), name: 'Studio' })
      .where(eq(accounts.id, accountId));
    await expect(confirmServicesPlaceholder()).resolves.toEqual({
      ok: true,
      next: '/onboarding/where',
    });
  });

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
  it('returns field errors and writes nothing', async () => {
    await expect(saveBusinessPlaceholder('   ')).resolves.toMatchObject({
      ok: false,
      fieldErrors: { name: expect.any(String) },
    });
    await expect(saveWherePlaceholder('')).resolves.toMatchObject({
      ok: false,
      fieldErrors: { address: expect.any(String) },
    });
    const r = await row();
    expect(r.name).toBeNull();
    expect(r.address).toBeNull();
  });

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
    await expect(saveBusinessPlaceholder('X')).rejects.toThrow(
      'REDIRECT:/onboarding',
    );
  });

  it('redirects a completed account', async () => {
    await db
      .update(accounts)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(accounts.id, accountId));
    await expect(saveBusinessPlaceholder('X')).rejects.toThrow(
      'REDIRECT:/today',
    );
  });

  it('goToDashboard replaces the history entry', async () => {
    await expect(goToDashboard()).resolves.toEqual({
      ok: true,
      next: '/today',
      replace: true,
    });
  });
});
