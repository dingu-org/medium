import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { middleware } from '@/middleware';

const { createServerClientMock, getUserMock } = vi.hoisted(() => ({
  createServerClientMock: vi.fn(),
  getUserMock: vi.fn(),
}));

vi.mock('@supabase/ssr', () => ({
  createServerClient: createServerClientMock,
}));

function makeRequest(): NextRequest {
  return new NextRequest(new URL('http://localhost/today'), {
    headers: { cookie: 'sb-access-token=old' },
  });
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: 'pt-a' } } });
  createServerClientMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('middleware', () => {
  it('refreshes the session and propagates rotated cookies onto the response', async () => {
    createServerClientMock.mockImplementation(
      (_url: string, _key: string, options: {
        cookies: { setAll(cookies: { name: string; value: string; options?: object }[]): void };
      }) => ({
        auth: {
          getUser: async () => {
            // Supabase writes the rotated tokens back through setAll.
            options.cookies.setAll([
              { name: 'sb-access-token', value: 'fresh', options: { path: '/' } },
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
});
