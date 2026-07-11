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
    await expect(Home()).rejects.toThrow('REDIRECT:/today');
  });

  it('renders the landing for signed-out visitors', async () => {
    authState.userId = null;
    const element = await Home();
    expect(element.type).toBe(LandingPage);
  });
});
