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

import { markSeenAndAdvance } from '../../actions';

const NEXT = { ok: true, next: '/onboarding/notifications' };
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
    email: `onboarding-wa-actions-${Date.now()}@example.com`,
    password: 'onboarding-wa-actions-pass-1234',
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
  await db.insert(availabilityRules).values({
    accountId,
    weekday: 1,
    startTime: '09:00:00',
    endTime: '17:00:00',
  });
});

describe.each(['completed', 'skipped'] as const)(
  'markSeenAndAdvance("whatsapp", "%s")',
  (outcome) => {
    it('marks the step seen and moves on without touching earlier steps', async () => {
      const before = await account();
      await expect(markSeenAndAdvance('whatsapp', outcome)).resolves.toEqual(
        NEXT,
      );
      const after = await account();
      expect(after.onboardingWhatsappSeenAt).not.toBeNull();
      expect(after.name).toBe(before.name);
      expect(after.businessType).toBe(before.businessType);
      expect(after.address).toBe(before.address);
      const svc = await db
        .select()
        .from(services)
        .where(eq(services.accountId, accountId));
      expect(svc).toHaveLength(1);
      const rules = await db
        .select()
        .from(availabilityRules)
        .where(eq(availabilityRules.accountId, accountId));
      expect(rules).toHaveLength(1);
    });
  },
);

describe('markSeenAndAdvance: idempotence and completion', () => {
  it('keeps the first timestamp on repeated calls', async () => {
    await markSeenAndAdvance('whatsapp', 'skipped');
    const first = (await account()).onboardingWhatsappSeenAt;
    await markSeenAndAdvance('whatsapp', 'completed');
    expect((await account()).onboardingWhatsappSeenAt).toEqual(first);
  });

  it('is closed to a completed account (the reopened screen must not call it)', async () => {
    await db
      .update(accounts)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(accounts.id, accountId));
    await expect(markSeenAndAdvance('whatsapp', 'skipped')).rejects.toThrow(
      'REDIRECT:/today',
    );
    expect((await account()).onboardingWhatsappSeenAt).toBeNull();
  });
});
