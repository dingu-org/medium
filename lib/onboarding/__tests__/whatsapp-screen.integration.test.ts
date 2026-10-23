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
import {
  accounts,
  availabilityRules,
  services,
  whatsappConnections,
} from '@/lib/db/schema';
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

import { loadFlowFacts } from '../flow-state';
import { enterScreen, enterWhatsappScreen } from '../guard';

let accountId = '';

async function reset() {
  await db
    .delete(whatsappConnections)
    .where(eq(whatsappConnections.accountId, accountId));
  await db
    .update(accounts)
    .set({
      onboardingFlow: 'guided',
      name: null,
      businessType: null,
      address: null,
      city: null,
      country: null,
      serviceArea: null,
      onboardingIntroSeenAt: null,
      onboardingWhatsappSeenAt: null,
      onboardingNotificationsSeenAt: null,
      onboardingCompletedAt: null,
    })
    .where(eq(accounts.id, accountId));
  await db
    .delete(availabilityRules)
    .where(eq(availabilityRules.accountId, accountId));
  await db.delete(services).where(eq(services.accountId, accountId));
}

/** Every step before WhatsApp done: the account is resumable at whatsapp. */
async function doneUpToWhatsapp() {
  await db
    .update(accounts)
    .set({
      onboardingIntroSeenAt: new Date(),
      name: 'Studio',
      businessType: 'other_professional',
      address: 'Rruga 1',
      city: 'Tiranë',
    })
    .where(eq(accounts.id, accountId));
  await db.insert(services).values({
    accountId,
    name: 'Manikyr',
    durationMin: 45,
    priceLek: 2500,
    mode: 'at_business',
    description: 'Manikyr me xhel',
  });
  await db.insert(availabilityRules).values({
    accountId,
    weekday: 1,
    startTime: '09:00:00',
    endTime: '17:00:00',
  });
}

async function complete() {
  await db
    .update(accounts)
    .set({ onboardingCompletedAt: new Date() })
    .where(eq(accounts.id, accountId));
}

async function addConnection(status: 'active' | 'revoked') {
  await db.insert(whatsappConnections).values({
    accountId,
    phoneNumberId: `pn-${accountId.slice(0, 8)}-${Date.now()}`,
    wabaId: `w-${accountId.slice(0, 8)}`,
    status,
  });
}

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `onboarding-wa-screen-${Date.now()}@example.com`,
    password: 'onboarding-wa-screen-pass-1234',
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

describe('enterWhatsappScreen', () => {
  it('behaves like enterScreen for an account still in the flow', async () => {
    await doneUpToWhatsapp();
    const ctx = await enterWhatsappScreen();
    expect(ctx.reopened).toBe(false);
    expect(ctx.progress?.kind).toBe('step');
    expect(ctx.backHref).toBe('/onboarding/availability');
    const { accountId: id, facts, progress, backHref } = ctx;
    expect({ accountId: id, facts, progress, backHref }).toEqual(
      await enterScreen('whatsapp'),
    );
  });

  it('sends an account with required steps missing to the resume screen', async () => {
    await expect(enterWhatsappScreen()).rejects.toThrow(
      'REDIRECT:/onboarding/how-it-works',
    );
  });

  it('lets a completed account without a connection reopen it', async () => {
    await doneUpToWhatsapp();
    await complete();
    await expect(enterWhatsappScreen()).resolves.toMatchObject({
      reopened: true,
      progress: null,
      backHref: '/today',
    });
  });

  it('sends a completed, connected account to the settings page', async () => {
    await doneUpToWhatsapp();
    await complete();
    await addConnection('active');
    await expect(enterWhatsappScreen()).rejects.toThrow(
      'REDIRECT:/settings/whatsapp',
    );
  });

  it('treats a revoked connection as not connected', async () => {
    await doneUpToWhatsapp();
    await complete();
    await addConnection('revoked');
    await expect(enterWhatsappScreen()).resolves.toMatchObject({
      reopened: true,
    });
  });

  it('sends a legacy account to /onboarding', async () => {
    await db
      .update(accounts)
      .set({ onboardingFlow: 'legacy' })
      .where(eq(accounts.id, accountId));
    await expect(enterWhatsappScreen()).rejects.toThrow('REDIRECT:/onboarding');
  });

  it('leaves every other screen closed to a completed account', async () => {
    await doneUpToWhatsapp();
    await complete();
    await expect(enterScreen('intro')).rejects.toThrow('REDIRECT:/today');
    await expect(enterScreen('whatsapp')).rejects.toThrow('REDIRECT:/today');
  });
});

describe('loadFlowFacts().whatsappConnected', () => {
  it('is true only for an active connection', async () => {
    expect((await loadFlowFacts(accountId)).whatsappConnected).toBe(false);
    await addConnection('revoked');
    expect((await loadFlowFacts(accountId)).whatsappConnected).toBe(false);
    await addConnection('active');
    const facts = await loadFlowFacts(accountId);
    expect(facts.whatsappConnected).toBe(true);
    expect(facts.whatsappSeen).toBe(true);
  });
});
