import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LINK_EXPIRED, LINK_FAILED } from '@/lib/auth/link-errors';
import { RECOVERY_COOKIE } from '@/lib/auth/recovery';

const { exchangeMock, cookieSetMock } = vi.hoisted(() => ({
  exchangeMock: vi.fn(),
  cookieSetMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { exchangeCodeForSession: exchangeMock },
  }),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: cookieSetMock }),
}));

import { GET } from '../route';

const ORIGIN = 'http://localhost:3000';

function callback(query: string) {
  return GET(new NextRequest(new URL(`${ORIGIN}/auth/callback${query}`)));
}

function target(response: Response) {
  const url = new URL(response.headers.get('location') ?? '');
  return `${url.pathname}${url.search}`;
}

beforeEach(() => {
  exchangeMock.mockReset();
  exchangeMock.mockResolvedValue({
    data: { user: { id: 'pt-a' } },
    error: null,
  });
  cookieSetMock.mockReset();
});

describe('GET /auth/callback', () => {
  it('still exchanges the Google OAuth code and lands on the default screen', async () => {
    const response = await callback('?code=oauth-code');

    expect(exchangeMock).toHaveBeenCalledWith('oauth-code');
    expect(target(response)).toBe('/today');
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it('honours a sanitised next after an OAuth exchange', async () => {
    const response = await callback('?code=oauth-code&next=/settings/services');
    expect(target(response)).toBe('/settings/services');
  });

  it('rejects an off-origin next after an OAuth exchange', async () => {
    const response = await callback(
      `?code=oauth-code&next=${encodeURIComponent('//evil.example.com')}`,
    );
    expect(target(response)).toBe('/today');
  });

  it('keeps accepting legacy recovery code links and stamps the marker', async () => {
    const response = await callback('?code=recovery-code&next=/reset-password');

    expect(target(response)).toBe('/reset-password');
    expect(cookieSetMock).toHaveBeenCalledWith(
      RECOVERY_COOKIE,
      '1',
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
  });

  it('reports a missing code as a failed link', async () => {
    const response = await callback('');

    expect(exchangeMock).not.toHaveBeenCalled();
    expect(target(response)).toBe(`/sign-in?error=${LINK_FAILED}`);
  });

  it('distinguishes an expired code from a generic exchange failure', async () => {
    exchangeMock.mockResolvedValue({
      data: { user: null },
      error: {
        code: 'otp_expired',
        message: 'Email link is invalid or has expired',
      },
    });
    expect(target(await callback('?code=stale&next=/reset-password'))).toBe(
      `/sign-in?error=${LINK_EXPIRED}`,
    );

    exchangeMock.mockResolvedValue({
      data: { user: null },
      error: { code: 'flow_state_not_found', message: 'invalid flow state' },
    });
    expect(target(await callback('?code=nope'))).toBe(
      `/sign-in?error=${LINK_FAILED}`,
    );
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it('classifies an upstream GoTrue error before trying to exchange', async () => {
    const response = await callback(
      '?error=access_denied&error_code=otp_expired',
    );

    expect(exchangeMock).not.toHaveBeenCalled();
    expect(target(response)).toBe(`/sign-in?error=${LINK_EXPIRED}`);
  });
});
