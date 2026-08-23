import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config, middleware } from '@/middleware';

const { createServerClientMock, getUserMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: createServerClientMock,
}));

function makeRequest(path = '/today'): NextRequest {
  return new NextRequest(new URL(`http://localhost${path}`), {
    headers: { cookie: 'sb-access-token=old' },
  });
}

/** The matcher as Next applies it: a path is handled iff the pattern matches. */
function handles(path: string): boolean {
  return new RegExp(`^${config.matcher[0]}$`).test(path);
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: 'account-a' } } });
  createServerClientMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('middleware', () => {
  it('refreshes the session and propagates rotated cookies onto the response', async () => {
    createServerClientMock.mockImplementation(
      (
        _url: string,
        _key: string,
        options: {
          cookies: {
            setAll(
              cookies: { name: string; value: string; options?: object }[],
            ): void;
          };
        },
      ) => ({
        auth: {
          getUser: async () => {
            // Supabase writes the rotated tokens back through setAll.
            options.cookies.setAll([
              {
                name: 'sb-access-token',
                value: 'fresh',
                options: { path: '/' },
              },
            ]);
            return getUserMock();
          },
        },
      }),
    );

    const response = await middleware(makeRequest());

    expect(getUserMock).toHaveBeenCalledOnce();
    expect(response.cookies.get('sb-access-token')?.value).toBe('fresh');
  });

  it('throws instead of silently skipping the refresh when config is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    await expect(middleware(makeRequest())).rejects.toThrow(
      'NEXT_PUBLIC_SUPABASE_URL is required',
    );
    expect(createServerClientMock).not.toHaveBeenCalled();
  });

  // NEXT_PUBLIC_* are inlined at build time and have gone missing from a Vercel
  // build before. Failing loud on an authenticated route is right; taking the
  // marketing page and the legal documents down with it is not.
  it.each(['/', '/privacy', '/terms', '/help', '/en/privacy', '/sign-in'])(
    'still serves %s when config is missing',
    async (path) => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');

      const response = await middleware(makeRequest(path));

      expect(response.status).toBe(200);
      expect(createServerClientMock).not.toHaveBeenCalled();
    },
  );

  it.each(['/today', '/chat', '/settings/services', '/onboarding'])(
    'still fails loud on %s when config is missing',
    async (path) => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
      await expect(middleware(makeRequest(path))).rejects.toThrow(
        'NEXT_PUBLIC_SUPABASE_ANON_KEY is required',
      );
    },
  );
});

describe('middleware matcher', () => {
  // Both routes mint the session themselves; a refresh of the stale cookies they
  // arrive with can emit session-clearing Set-Cookie headers that merge with the
  // fresh ones the route handler wrote.
  it.each(['/auth/confirm', '/auth/callback'])('skips %s', (path) => {
    expect(handles(path)).toBe(false);
  });

  it('still covers the pages that carry a session', () => {
    expect(handles('/today')).toBe(true);
    expect(handles('/reset-password')).toBe(true);
    expect(handles('/')).toBe(true);
  });

  it('keeps skipping assets and the webhook endpoints', () => {
    expect(handles('/_next/static/chunk.js')).toBe(false);
    expect(handles('/api/inngest')).toBe(false);
    expect(handles('/api/webhooks/whatsapp')).toBe(false);
    expect(handles('/icon.png')).toBe(false);
  });
});
