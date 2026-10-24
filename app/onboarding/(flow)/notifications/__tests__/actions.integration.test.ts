import { eq } from 'drizzle-orm';
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
import { accounts, availabilityRules, services } from '@/lib/db/schema';
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

import { resumeScreen } from '@/lib/onboarding/flow';
import { loadFlowFacts } from '@/lib/onboarding/flow-state';
import { guidedGateRedirect } from '@/lib/onboarding/gate';
import { enterScreen } from '@/lib/onboarding/guard';
import { markSeenAndAdvance } from '../../actions';
import { showNotificationsGuide } from '../actions';

const FINISH = { ok: true, next: '/onboarding/finish' };
let accountId = '';

async function account() {
  const [row] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, accountId));
  return row;
}

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `onboarding-notif-actions-${Date.now()}@example.com`,
    password: 'onboarding-notif-actions-pass-1234',
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
      onboardingIntroSeenAt: new Date(),
      onboardingWhatsappSeenAt: new Date(),
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
  await db.insert(availabilityRules).values({
    accountId,
    weekday: 1,
    startTime: '09:00:00',
    endTime: '17:00:00',
  });
});

describe('showNotificationsGuide', () => {
  it('marks the step seen, does not complete, and opens the guide', async () => {
    await expect(showNotificationsGuide()).resolves.toEqual({
      ok: true,
      next: '/onboarding/notifications/guide',
    });
    const row = await account();
    expect(row.onboardingNotificationsSeenAt).not.toBeNull();
    expect(row.onboardingCompletedAt).toBeNull();
  });

  it('keeps the first timestamp on a second call', async () => {
    await showNotificationsGuide();
    const first = (await account()).onboardingNotificationsSeenAt;
    await showNotificationsGuide();
    expect((await account()).onboardingNotificationsSeenAt).toEqual(first);
  });

  it('lets the reopened app resume at Finish and completes there', async () => {
    await showNotificationsGuide();
    const facts = await loadFlowFacts(accountId);
    expect(resumeScreen(facts)).toBe('finish');
    expect(guidedGateRedirect(await account())).toBe('/onboarding');
    // Back and the guide stay reachable.
    await expect(enterScreen('notifications')).resolves.toMatchObject({
      accountId,
    });
    await enterScreen('finish');
    expect((await account()).onboardingCompletedAt).not.toBeNull();
  });

  it('is closed to a completed account', async () => {
    await db
      .update(accounts)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(accounts.id, accountId));
    await expect(showNotificationsGuide()).rejects.toThrow('REDIRECT:/today');
  });

  it('sends a legacy account back to the checklist', async () => {
    await db
      .update(accounts)
      .set({ onboardingFlow: 'legacy' })
      .where(eq(accounts.id, accountId));
    await expect(showNotificationsGuide()).rejects.toThrow(
      'REDIRECT:/onboarding',
    );
  });
});

describe.each(['completed', 'skipped'] as const)(
  'markSeenAndAdvance("notifications", "%s")',
  (outcome) => {
    it('marks the step seen and goes to Finish', async () => {
      await expect(
        markSeenAndAdvance('notifications', outcome),
      ).resolves.toEqual(FINISH);
      expect((await account()).onboardingNotificationsSeenAt).not.toBeNull();
    });
  },
);
