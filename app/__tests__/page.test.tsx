import { describe, expect, it, vi } from 'vitest';
import Home from '@/app/page';
import { LandingPage } from '@/app/_landing/landing-page';

const authState = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: authState.userId ? { id: authState.userId } : null },
      }),
    },
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

describe('Home (/)', () => {
  it('redirects signed-in users to /today', async () => {
    authState.userId = '11111111-1111-4111-8111-111111111111';
    await expect(Home({ searchParams: Promise.resolve({}) })).rejects.toThrow(
      'REDIRECT:/today',
    );
  });

  it('renders the landing for signed-out visitors', async () => {
    authState.userId = null;
    const element = await Home({ searchParams: Promise.resolve({}) });
    expect(element.type).toBe(LandingPage);
  });

  // GoTrue drops a one-time auth token on `/` when an email link's redirect_to
  // is missing from the project allowlist; the token burns on click, so `/` has
  // to hand it to the route that can redeem it instead of rendering the landing.
  it('forwards a stray PKCE code to the callback route', async () => {
    authState.userId = null;
    await expect(
      Home({ searchParams: Promise.resolve({ code: 'abc 123' }) }),
    ).rejects.toThrow('REDIRECT:/auth/callback?code=abc%20123');
  });

  it('forwards a stray token hash to the confirm route', async () => {
    authState.userId = null;
    await expect(
      Home({
        searchParams: Promise.resolve({ token_hash: 'h1', type: 'recovery' }),
      }),
    ).rejects.toThrow('REDIRECT:/auth/confirm?token_hash=h1&type=recovery');
  });
});
