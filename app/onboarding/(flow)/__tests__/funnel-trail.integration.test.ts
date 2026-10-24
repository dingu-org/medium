import { asc, eq } from 'drizzle-orm';
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
  onboardingEvents,
  services,
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
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith('REDIRECT:')) {
      throw error;
    }
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { getUser: getUserMock } }),
}));

import { POST as shownRoute } from '@/app/api/onboarding/shown/route';
import { enterScreen } from '@/lib/onboarding/guard';
import { recordOnboardingEvent } from '@/lib/onboarding/funnel';
import { goToDashboard, markSeenAndAdvance } from '../actions';
import { saveAvailabilityStep } from '../availability/actions';
import { saveBusiness } from '../business/actions';
import { showNotificationsGuide } from '../notifications/actions';
import { saveServiceStep, type ServiceStepInput } from '../services/actions';
import { saveWhere } from '../where/actions';

let accountId = '';

const SECRETS = {
  name: 'Studio Zanafillë',
  address: 'Rruga Kalaja 77',
  service: 'Manikyr Sekret',
  description: 'Përshkrim privat i shërbimit',
  price: '4 321',
};

const service = (mode: string): ServiceStepInput => ({
  id: null,
  name: SECRETS.service,
  durationMinutes: 60,
  price: SECRETS.price,
  mode,
  description: SECRETS.description,
  active: true,
});

async function shown(screen: string) {
  const res = await shownRoute(
    new Request('http://localhost/api/onboarding/shown', {
      method: 'POST',
      body: JSON.stringify({ screen }),
    }),
  );
  expect(res.status).toBe(204);
}

async function trail() {
  const rows = await db
    .select()
    .from(onboardingEvents)
    .where(eq(onboardingEvents.accountId, accountId))
    .orderBy(asc(onboardingEvents.occurredAt), asc(onboardingEvents.id));
  return rows;
}
const pairs = async () => (await trail()).map((r) => `${r.step}:${r.outcome}`);

async function walkTo(mode: 'at_business' | 'online') {
  await shown('intro');
  await markSeenAndAdvance('intro', 'completed');
  await shown('business');
  await saveBusiness({
    name: SECRETS.name,
    businessType: 'beauty_salon',
    fullName: '',
    title: '',
    tagline: '',
  });
  await shown('services');
  await saveServiceStep(service(mode));
  if (mode === 'at_business') {
    await shown('where');
    await saveWhere({
      city: 'Tiranë',
      address: SECRETS.address,
      directions: '',
      parking: '',
      entrance: '',
      floor: '',
      serviceArea: '',
    });
  }
  await shown('availability');
  await saveAvailabilityStep({
    timezone: 'Europe/Tirane',
    rules: [1, 2, 3].map((weekday) => ({
      weekday,
      start: '09:00',
      end: '17:00',
    })),
  });
  await shown('whatsapp');
  await markSeenAndAdvance('whatsapp', 'skipped');
  await shown('notifications');
  await markSeenAndAdvance('notifications', 'completed');
  await enterScreen('finish');
  await shown('finish');
  await goToDashboard();
}

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `onboarding-trail-${Date.now()}@example.com`,
    password: 'onboarding-trail-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Missing user');
  accountId = data.user.id;
});

afterAll(async () => {
  vi.restoreAllMocks();
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

beforeEach(async () => {
  vi.restoreAllMocks();
  getUserMock.mockResolvedValue({ data: { user: { id: accountId } } });
  headersMock.mockResolvedValue(new Headers());
  await db
    .delete(onboardingEvents)
    .where(eq(onboardingEvents.accountId, accountId));
  await db.delete(services).where(eq(services.accountId, accountId));
  await db
    .delete(availabilityRules)
    .where(eq(availabilityRules.accountId, accountId));
  await db
    .update(accounts)
    .set({
      onboardingFlow: 'guided',
      name: null,
      businessType: null,
      address: null,
      city: null,
      onboardingIntroSeenAt: null,
      onboardingWhatsappSeenAt: null,
      onboardingNotificationsSeenAt: null,
      onboardingCompletedAt: null,
    })
    .where(eq(accounts.id, accountId));
});

describe('the funnel trail of a guided account', () => {
  it('a full walk with a physical location leaves 16 ordered rows', async () => {
    await walkTo('at_business');
    expect(await pairs()).toEqual([
      'intro:shown',
      'intro:completed',
      'business:shown',
      'business:completed',
      'services:shown',
      'services:completed',
      'where:shown',
      'where:completed',
      'availability:shown',
      'availability:completed',
      'whatsapp:shown',
      'whatsapp:skipped',
      'notifications:shown',
      'notifications:completed',
      'finish:shown',
      'finish:completed',
    ]);
    const rows = await trail();
    expect(new Set(rows.map((r) => r.appEnv))).toEqual(new Set(['development']));
  });

  it('repeating shown and saves does not add rows', async () => {
    await shown('intro');
    await shown('intro');
    await markSeenAndAdvance('intro', 'completed');
    await markSeenAndAdvance('intro', 'completed');
    await shown('intro');
    expect(await pairs()).toEqual(['intro:shown', 'intro:completed']);
  });

  it('an online-only walk logs where as not applicable, never shown', async () => {
    await walkTo('online');
    const list = await pairs();
    expect(list).toHaveLength(15);
    expect(list.indexOf('where:not_applicable')).toBe(
      list.indexOf('services:completed') + 1,
    );
    expect(list).not.toContain('where:shown');
    expect(list).not.toContain('where:completed');
  });

  it('a save that leaves the step not done logs no completion', async () => {
    await shown('business');
    await saveBusiness({
      name: '',
      businessType: null,
      fullName: '',
      title: '',
      tagline: '',
    });
    expect(await pairs()).toEqual(['business:shown']);
  });

  it('holds none of the entered business content', async () => {
    await walkTo('at_business');
    const json = JSON.stringify(await trail());
    for (const value of Object.values(SECRETS)) {
      expect(json).not.toContain(value);
    }
    expect(json).not.toContain('Tiranë');
  });

  it('the iPhone guide records notifications as skipped', async () => {
    await showNotificationsGuide();
    expect(await pairs()).toEqual(['notifications:skipped']);
  });

  it('a legacy account emits nothing', async () => {
    await db
      .update(accounts)
      .set({ onboardingFlow: 'legacy' })
      .where(eq(accounts.id, accountId));
    await shown('intro');
    await recordOnboardingEvent(accountId, 'intro', 'completed');
    expect(await trail()).toHaveLength(0);
  });

  it('a failing funnel write does not break the step', async () => {
    const original = db.execute.bind(db);
    vi.spyOn(db, 'execute').mockImplementation(((query: unknown) => {
      const text = JSON.stringify(
        (query as { queryChunks?: unknown[] })?.queryChunks ?? [],
      );
      if (text.includes('onboarding_events')) {
        return Promise.reject(new Error('funnel down'));
      }
      return original(query as never);
    }) as never);
    await expect(markSeenAndAdvance('intro', 'completed')).resolves.toEqual({
      ok: true,
      next: '/onboarding/business',
    });
    vi.restoreAllMocks();
    const [row] = await db
      .select({ seen: accounts.onboardingIntroSeenAt })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    expect(row.seen).not.toBeNull();
    expect(await trail()).toHaveLength(0);
  });
});
