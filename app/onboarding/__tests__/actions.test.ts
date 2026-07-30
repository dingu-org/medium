import { beforeEach, describe, expect, it, vi } from 'vitest';
import { continueSetup, dismissAndGo } from '../actions';
import { ONBOARDING_SKIP_COOKIE, onboardingCookieValue } from '../constants';

const PT_ID = '11111111-1111-4111-8111-111111111111';

type CookieRecord = { value: string; options?: { maxAge?: number } };

const { store } = vi.hoisted(() => ({
  store: new Map<string, CookieRecord>(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const record = store.get(name);
      return record ? { name, value: record.value } : undefined;
    },
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      store.set(name, { value, options });
    },
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/db', () => ({ db: {} }));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: PT_ID } } }) },
  }),
}));

function formData(href: string): FormData {
  const data = new FormData();
  data.set('href', href);
  return data;
}

beforeEach(() => {
  store.clear();
});

describe('onboarding actions', () => {
  it('dismissAndGo records a 30-day dismissal', async () => {
    await expect(dismissAndGo(formData('/today'))).rejects.toThrow(
      'REDIRECT:/today',
    );
    expect(store.get(ONBOARDING_SKIP_COOKIE)).toMatchObject({
      value: onboardingCookieValue('dismissed', PT_ID),
      options: { maxAge: 60 * 60 * 24 * 30 },
    });
  });

  it('continueSetup marks a short-lived setup detour when nothing is set', async () => {
    await expect(
      continueSetup(formData('/settings/availability')),
    ).rejects.toThrow('REDIRECT:/settings/availability?from=onboarding');
    expect(store.get(ONBOARDING_SKIP_COOKIE)).toMatchObject({
      value: onboardingCookieValue('setup', PT_ID),
      options: { maxAge: 60 * 60 },
    });
  });

  it('continueSetup does not downgrade an existing 30-day dismissal', async () => {
    await expect(dismissAndGo(formData('/today'))).rejects.toThrow('REDIRECT:');
    await expect(
      continueSetup(formData('/settings/availability?tab=hours')),
    ).rejects.toThrow('REDIRECT:/settings/availability?tab=hours&from=onboarding');
    expect(store.get(ONBOARDING_SKIP_COOKIE)).toMatchObject({
      value: onboardingCookieValue('dismissed', PT_ID),
      options: { maxAge: 60 * 60 * 24 * 30 },
    });
  });

  it('continueSetup replaces another account’s marker', async () => {
    store.set(ONBOARDING_SKIP_COOKIE, {
      value: onboardingCookieValue('dismissed', 'other-pt'),
    });
    await expect(continueSetup(formData('/settings/services'))).rejects.toThrow(
      'REDIRECT:',
    );
    expect(store.get(ONBOARDING_SKIP_COOKIE)?.value).toBe(
      onboardingCookieValue('setup', PT_ID),
    );
  });
});
