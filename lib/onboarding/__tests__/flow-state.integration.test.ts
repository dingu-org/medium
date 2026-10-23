import { eq, sql } from 'drizzle-orm';
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
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser: getUserMock } }),
}));

import {
  advanceFrom,
  ensureOnboardingCompleted,
  loadFlowFacts,
  markStepSeen,
} from '../flow-state';
import { enterScreen, requireActiveFlowAccount } from '../guard';

let accountId = '';

async function reset() {
  await db
    .update(accounts)
    .set({
      onboardingFlow: 'guided',
      name: null,
      businessType: null,
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
}

async function row() {
  const [r] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return r;
}

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `onboarding-flow-${Date.now()}@example.com`,
    password: 'onboarding-flow-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Missing user');
  accountId = data.user.id;
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

beforeEach(async () => {
  await reset();
  getUserMock.mockResolvedValue({ data: { user: { id: accountId } } });
  headersMock.mockResolvedValue(new Headers());
});

describe('guided flow columns', () => {
  it('gives a new account the guided flow with every marker empty', async () => {
    // beforeEach resets the markers; the flow value is what the trigger set.
    const created = await row();
    expect(created.onboardingFlow).toBe('guided');
    expect(created.onboardingIntroSeenAt).toBeNull();
    expect(created.onboardingCompletedAt).toBeNull();
  });

  it('defaults the column to guided', async () => {
    const result = await db.execute<{ column_default: string }>(
      sql`select column_default from information_schema.columns
          where table_name = 'accounts' and column_name = 'onboarding_flow'`,
    );
    expect([...result][0]?.column_default).toContain('guided');
  });
});

describe('loadFlowFacts', () => {
  it('reflects name, address, services confirmation and rules', async () => {
    const empty = await loadFlowFacts(accountId);
    expect(empty).toMatchObject({
      flow: 'guided',
      business: false,
      services: false,
      where: false,
      availability: false,
    });

    await db
      .update(accounts)
      .set({
        name: ' Studio ',
        businessType: 'other_professional',
        address: 'Rruga 1',
        servicesConfiguredAt: new Date(),
      })
      .where(eq(accounts.id, accountId));
    await db
      .insert(availabilityRules)
      .values({
        accountId,
        weekday: 1,
        startTime: '09:00:00',
        endTime: '17:00:00',
      });

    const filled = await loadFlowFacts(accountId);
    expect(filled).toMatchObject({
      business: true,
      services: true, // the signup trigger seeded active services
      where: true,
      availability: true,
    });
    expect(filled.serviceModes.length).toBeGreaterThan(0);
  });
});

describe('business step', () => {
  it('is done only with a name and a type', async () => {
    await db
      .update(accounts)
      .set({ name: 'Studio' })
      .where(eq(accounts.id, accountId));
    expect((await loadFlowFacts(accountId)).business).toBe(false);
    await db
      .update(accounts)
      .set({ businessType: 'dentist' })
      .where(eq(accounts.id, accountId));
    expect((await loadFlowFacts(accountId)).business).toBe(true);
  });

  it('is not done with a type and no name', async () => {
    await db
      .update(accounts)
      .set({ businessType: 'dentist' })
      .where(eq(accounts.id, accountId));
    expect((await loadFlowFacts(accountId)).business).toBe(false);
  });

  it('the database rejects a value outside the closed list', async () => {
    await expect(
      db.execute(
        sql`update accounts set business_type = 'hairdresser' where id = ${accountId}`,
      ),
    ).rejects.toThrow();
  });
});

describe('markStepSeen', () => {
  it('keeps the first timestamp when called twice', async () => {
    await markStepSeen(accountId, 'whatsapp');
    const first = (await row()).onboardingWhatsappSeenAt;
    expect(first).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 15));
    await markStepSeen(accountId, 'whatsapp');
    expect((await row()).onboardingWhatsappSeenAt?.getTime()).toBe(
      first?.getTime(),
    );
  });
});

describe('ensureOnboardingCompleted', () => {
  it('sets the marker once and keeps the first timestamp', async () => {
    await ensureOnboardingCompleted(accountId);
    const first = (await row()).onboardingCompletedAt;
    expect(first).not.toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 15));
    await ensureOnboardingCompleted(accountId);
    expect((await row()).onboardingCompletedAt?.getTime()).toBe(
      first?.getTime(),
    );
  });

  it('is a no-op for a legacy account', async () => {
    await db
      .update(accounts)
      .set({ onboardingFlow: 'legacy' })
      .where(eq(accounts.id, accountId));
    await ensureOnboardingCompleted(accountId);
    expect((await row()).onboardingCompletedAt).toBeNull();
  });
});

describe('advanceFrom', () => {
  it('points at the next screen once the step is done', async () => {
    await db
      .update(accounts)
      .set({
        onboardingIntroSeenAt: new Date(),
        name: 'Studio',
        businessType: 'other_professional',
      })
      .where(eq(accounts.id, accountId));
    await expect(advanceFrom(accountId, 'business')).resolves.toEqual({
      ok: true,
      next: '/onboarding/services',
    });
  });

  it('resumes at the first unfinished screen when the step is not done', async () => {
    await expect(advanceFrom(accountId, 'business')).resolves.toMatchObject({
      next: '/onboarding/how-it-works',
    });
  });

  it('resumes at business when only the name is saved', async () => {
    await db
      .update(accounts)
      .set({ onboardingIntroSeenAt: new Date(), name: 'Studio' })
      .where(eq(accounts.id, accountId));
    await expect(advanceFrom(accountId, 'business')).resolves.toMatchObject({
      next: '/onboarding/business',
    });
  });
});

describe('enterScreen', () => {
  it('redirects a screen beyond the resume point to the resume screen', async () => {
    await expect(enterScreen('availability')).rejects.toThrow(
      'REDIRECT:/onboarding/how-it-works',
    );
  });

  it('lets the resume screen render with progress and no Back on the first', async () => {
    const ctx = await enterScreen('intro');
    expect(ctx.backHref).toBeNull();
    expect(ctx.progress).toEqual({ kind: 'step', position: 1, total: 7 });
  });

  it('sends a legacy account to /onboarding', async () => {
    await db
      .update(accounts)
      .set({ onboardingFlow: 'legacy' })
      .where(eq(accounts.id, accountId));
    await expect(enterScreen('intro')).rejects.toThrow('REDIRECT:/onboarding');
  });

  it('sends a completed account to the dashboard, except for Finish', async () => {
    await db
      .update(accounts)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(accounts.id, accountId));
    await expect(enterScreen('intro')).rejects.toThrow('REDIRECT:/today');
    await expect(enterScreen('finish')).resolves.toMatchObject({
      backHref: null,
    });
  });

  async function finishReady() {
    await db
      .update(accounts)
      .set({
        onboardingIntroSeenAt: new Date(),
        onboardingWhatsappSeenAt: new Date(),
        onboardingNotificationsSeenAt: new Date(),
        name: 'Studio',
        businessType: 'other_professional',
        address: 'Rruga 1',
        servicesConfiguredAt: new Date(),
      })
      .where(eq(accounts.id, accountId));
    await db
      .insert(availabilityRules)
      .values({
        accountId,
        weekday: 1,
        startTime: '09:00:00',
        endTime: '17:00:00',
      });
  }

  it('completes onboarding when Finish is really visited', async () => {
    await finishReady();
    await enterScreen('finish');
    expect((await row()).onboardingCompletedAt).not.toBeNull();
  });

  it('does not complete onboarding on a Next.js prefetch', async () => {
    await finishReady();
    headersMock.mockResolvedValue(new Headers({ 'next-router-prefetch': '1' }));
    await enterScreen('finish');
    expect((await row()).onboardingCompletedAt).toBeNull();
  });
});

describe('requireActiveFlowAccount', () => {
  it('redirects legacy and completed accounts', async () => {
    await db
      .update(accounts)
      .set({ onboardingFlow: 'legacy' })
      .where(eq(accounts.id, accountId));
    await expect(requireActiveFlowAccount()).rejects.toThrow(
      'REDIRECT:/onboarding',
    );
    await db
      .update(accounts)
      .set({ onboardingFlow: 'guided', onboardingCompletedAt: new Date() })
      .where(eq(accounts.id, accountId));
    await expect(requireActiveFlowAccount()).rejects.toThrow('REDIRECT:/today');
  });

  it('returns the id for an active guided account', async () => {
    await expect(requireActiveFlowAccount()).resolves.toBe(accountId);
  });
});
