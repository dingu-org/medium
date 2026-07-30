import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LINK_EXPIRED,
  LINK_FAILED,
  OAUTH_CANCELLED,
} from '@/lib/auth/link-errors';
import { RECOVERY_COOKIE, recoveryCookieValue } from '@/lib/auth/recovery';

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

  it('keeps accepting legacy recovery code links and binds the marker to the user', async () => {
    const response = await callback('?code=recovery-code&next=/reset-password');

    expect(target(response)).toBe('/reset-password');
    expect(cookieSetMock).toHaveBeenCalledWith(
      RECOVERY_COOKIE,
      recoveryCookieValue('pt-a'),
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );
  });

  it('refuses to stamp a marker it cannot bind to a user', async () => {
    exchangeMock.mockResolvedValue({ data: { user: null }, error: null });

    const response = await callback('?code=recovery-code&next=/reset-password');

    expect(cookieSetMock).not.toHaveBeenCalled();
    expect(target(response)).toBe(`/sign-in?error=${LINK_FAILED}`);
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

  it('classifies an upstream expired link before trying to exchange', async () => {
    const response = await callback(
      '?error=access_denied&error_code=otp_expired',
    );

    expect(exchangeMock).not.toHaveBeenCalled();
    expect(target(response)).toBe(`/sign-in?error=${LINK_EXPIRED}`);
  });

  // This route is also where Google OAuth lands. Someone who closed the consent
  // screen comes back with access_denied and no expiry code; calling that a
  // broken email link sent them to /forgot-password for no reason.
  it.each([
    '?error=access_denied&error_description=User+denied+access',
    '?error=server_error&error_code=unexpected_failure',
  ])(
    'reports a declined Google consent as a cancelled sign-in (%s)',
    async (query) => {
      const response = await callback(query);

      expect(exchangeMock).not.toHaveBeenCalled();
      expect(target(response)).toBe(`/sign-in?error=${OAUTH_CANCELLED}`);
    },
  );
});
