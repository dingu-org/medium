import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LINK_EXPIRED, LINK_FAILED } from '@/lib/auth/link-errors';
import { RECOVERY_COOKIE, recoveryCookieValue } from '@/lib/auth/recovery';

const { verifyOtpMock, cookieSetMock } = vi.hoisted(() => ({
  verifyOtpMock: vi.fn(),
  cookieSetMock: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { verifyOtp: verifyOtpMock } }),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({ set: cookieSetMock }),
}));

import { GET } from '../route';

const ORIGIN = 'http://localhost:3000';

function confirm(query: string) {
  return GET(new NextRequest(new URL(`${ORIGIN}/auth/confirm${query}`)));
}

function location(response: Response) {
  return new URL(response.headers.get('location') ?? '').pathname;
}

function target(response: Response) {
  const url = new URL(response.headers.get('location') ?? '');
  return `${url.pathname}${url.search}`;
}

beforeEach(() => {
  verifyOtpMock.mockReset();
  verifyOtpMock.mockResolvedValue({
    data: { user: { id: 'account-a' } },
    error: null,
  });
  cookieSetMock.mockReset();
});

describe('GET /auth/confirm', () => {
  it('verifies a recovery token hash and lands on the reset screen', async () => {
    const response = await confirm(
      '?token_hash=hash-a&type=recovery&next=/reset-password',
    );

    expect(verifyOtpMock).toHaveBeenCalledWith({
      type: 'recovery',
      token_hash: 'hash-a',
    });
    expect(target(response)).toBe('/reset-password');
  });

  it('verifies a signup confirmation without a next and uses the default', async () => {
    const response = await confirm('?token_hash=hash-b&type=signup');

    expect(verifyOtpMock).toHaveBeenCalledWith({
      type: 'signup',
      token_hash: 'hash-b',
    });
    expect(target(response)).toBe('/today');
  });

  it('stamps the recovery marker only for a recovery link, bound to that user', async () => {
    await confirm('?token_hash=hash-a&type=recovery&next=/reset-password');
    expect(cookieSetMock).toHaveBeenCalledWith(
      RECOVERY_COOKIE,
      recoveryCookieValue('account-a'),
      expect.objectContaining({ httpOnly: true, path: '/' }),
    );

    cookieSetMock.mockClear();
    await confirm('?token_hash=hash-b&type=signup&next=/reset-password');
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it('refuses to stamp a marker it cannot bind to a user', async () => {
    verifyOtpMock.mockResolvedValue({ data: { user: null }, error: null });

    const response = await confirm('?token_hash=hash-a&type=recovery');

    expect(cookieSetMock).not.toHaveBeenCalled();
    expect(target(response)).toBe(`/sign-in?error=${LINK_FAILED}`);
  });

  // GoTrue resolves `magiclink` and `email` against the same token column as
  // `recovery`, so both used to verify a reset link and issue a full session —
  // while the `type === 'recovery'` branch below skipped the recovery cookie and
  // honoured `next`. A reset link could be rewritten into a silent takeover.
  it.each(['magiclink', 'invite'])(
    'refuses a recovery token presented as type=%s',
    async (type) => {
      const response = await confirm(
        `?token_hash=hash-a&type=${type}&next=/settings/services`,
      );

      expect(verifyOtpMock).not.toHaveBeenCalled();
      expect(cookieSetMock).not.toHaveBeenCalled();
      expect(target(response)).toBe(`/sign-in?error=${LINK_FAILED}`);
    },
  );

  // `email` is the one alias kept, for confirmation mail already in inboxes. It
  // must verify as `signup` — the type GoTrue refuses a recovery hash under —
  // so the rewrite fails at GoTrue instead of yielding a session here.
  it('verifies a legacy type=email link as a signup token', async () => {
    const response = await confirm(
      '?token_hash=hash-a&type=email&next=/settings/services',
    );

    expect(verifyOtpMock).toHaveBeenCalledWith({
      type: 'signup',
      token_hash: 'hash-a',
    });
    expect(cookieSetMock).not.toHaveBeenCalled();
    expect(target(response)).toBe('/settings/services');
  });

  it('rejects a missing token hash without calling Supabase', async () => {
    const response = await confirm('?type=recovery');

    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(target(response)).toBe(`/sign-in?error=${LINK_FAILED}`);
  });

  it('rejects an unknown otp type without calling Supabase', async () => {
    const response = await confirm('?token_hash=hash-a&type=whatever');

    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(target(response)).toBe(`/sign-in?error=${LINK_FAILED}`);
  });

  it('tells the PT an expired link is expired', async () => {
    verifyOtpMock.mockResolvedValue({
      data: { user: null },
      error: {
        code: 'otp_expired',
        message: 'Email link is invalid or has expired',
      },
    });

    const response = await confirm('?token_hash=stale&type=recovery');

    expect(target(response)).toBe(`/sign-in?error=${LINK_EXPIRED}`);
    expect(cookieSetMock).not.toHaveBeenCalled();
  });

  it('falls back to the generic failure for any other verify error', async () => {
    verifyOtpMock.mockResolvedValue({
      data: { user: null },
      error: { code: 'validation_failed', message: 'bad request' },
    });

    const response = await confirm('?token_hash=broken&type=recovery');

    expect(target(response)).toBe(`/sign-in?error=${LINK_FAILED}`);
  });

  it('classifies GoTrue bouncing the link back with its own error params', async () => {
    const response = await confirm(
      '?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid',
    );

    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(target(response)).toBe(`/sign-in?error=${LINK_EXPIRED}`);
  });

  it('forwards a legacy PKCE code link to the callback so old mail still works', async () => {
    const response = await confirm('?code=pkce-code&next=/reset-password');

    expect(verifyOtpMock).not.toHaveBeenCalled();
    expect(target(response)).toBe(
      '/auth/callback?code=pkce-code&next=/reset-password',
    );
  });

  it.each([
    ['//evil.example.com', '/today'],
    ['/\\evil.example.com', '/today'],
    ['/\t/evil.example.com', '/today'],
    ['https://evil.example.com/steal', '/today'],
    ['/settings/services', '/settings/services'],
  ])('sanitises next=%s', async (next, expected) => {
    // Not `recovery`: that type ignores `next` entirely and always lands on
    // /reset-password (see the test below), so it cannot exercise safeNext.
    const response = await confirm(
      `?token_hash=hash-a&type=signup&next=${encodeURIComponent(next)}`,
    );
    expect(location(response)).toBe(expected);
  });

  // The hosted recovery template is retyped by hand in the Supabase dashboard.
  // If `&next=/reset-password` is dropped there, trusting `next` would leave the
  // PT signed in on /today with the recovery cookie expiring unused and no
  // in-app way to set a password — verified, but still locked out.
  it.each(['', '&next=/today', '&next=/settings'])(
    'sends a verified recovery link to /reset-password whatever next says (%s)',
    async (nextParam) => {
      const response = await confirm(
        `?token_hash=hash-a&type=recovery${nextParam}`,
      );
      expect(location(response)).toBe('/reset-password');
    },
  );
});
