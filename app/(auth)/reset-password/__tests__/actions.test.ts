import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RECOVERY_COOKIE, recoveryCookieValue } from '@/lib/auth/recovery';
import { t } from '@/lib/i18n';

const { getUserMock, updateUserMock, cookieJar } = vi.hoisted(() => ({
  getUserMock: vi.fn(),
  updateUserMock: vi.fn(),
  cookieJar: new Map<string, string>(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { getUser: getUserMock, updateUser: updateUserMock },
  }),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      cookieJar.has(name) ? { name, value: cookieJar.get(name) } : undefined,
    set: (name: string, value: string) => cookieJar.set(name, value),
    delete: (name: string) => cookieJar.delete(name),
  }),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

import { type ResetPasswordState, resetPassword } from '../actions';

const INITIAL: ResetPasswordState = { error: null, fieldErrors: null };

function form(password: string, confirm = password) {
  const data = new FormData();
  data.set('password', password);
  data.set('confirm', confirm);
  return data;
}

beforeEach(() => {
  cookieJar.clear();
  getUserMock.mockReset();
  getUserMock.mockResolvedValue({ data: { user: { id: 'account-a' } } });
  updateUserMock.mockReset();
  updateUserMock.mockResolvedValue({ data: {}, error: null });
});

describe('resetPassword', () => {
  it('changes the password when the marker matches the signed-in user', async () => {
    cookieJar.set(RECOVERY_COOKIE, recoveryCookieValue('account-a'));

    await expect(
      resetPassword(INITIAL, form('new-password-1')),
    ).rejects.toThrow('REDIRECT:/sign-in?reset=1');
    expect(updateUserMock).toHaveBeenCalledWith({ password: 'new-password-1' });
  });

  it('burns the marker so the same session cannot reset again', async () => {
    cookieJar.set(RECOVERY_COOKIE, recoveryCookieValue('account-a'));

    await expect(
      resetPassword(INITIAL, form('new-password-1')),
    ).rejects.toThrow();
    expect(cookieJar.has(RECOVERY_COOKIE)).toBe(false);

    updateUserMock.mockClear();
    const state = await resetPassword(INITIAL, form('another-password-1'));
    expect(updateUserMock).not.toHaveBeenCalled();
    expect(state.error).toBe(t.auth.errors.callbackFailed);
  });

  it('refuses an ordinary session that never went through recovery', async () => {
    const state = await resetPassword(INITIAL, form('new-password-1'));

    expect(updateUserMock).not.toHaveBeenCalled();
    expect(state.error).toBe(t.auth.errors.callbackFailed);
  });

  // Shared device: PT A clicks a reset link, abandons the form and signs out;
  // PT B signs in inside the 10-minute window. A marker that only had to exist
  // would let the form change B's password.
  it('refuses a marker minted for a different user', async () => {
    cookieJar.set(RECOVERY_COOKIE, recoveryCookieValue('account-a'));
    getUserMock.mockResolvedValue({ data: { user: { id: 'account-b' } } });

    const state = await resetPassword(INITIAL, form('new-password-1'));

    expect(updateUserMock).not.toHaveBeenCalled();
    expect(state.error).toBe(t.auth.errors.callbackFailed);
    // Still B's own session, so the marker is left for A's tab to consume.
    expect(cookieJar.get(RECOVERY_COOKIE)).toBe(recoveryCookieValue('account-a'));
  });

  it('refuses a stale flag from before the marker carried a user id', async () => {
    cookieJar.set(RECOVERY_COOKIE, '1');

    const state = await resetPassword(INITIAL, form('new-password-1'));

    expect(updateUserMock).not.toHaveBeenCalled();
    expect(state.error).toBe(t.auth.errors.callbackFailed);
  });

  it('refuses when there is no session at all', async () => {
    cookieJar.set(RECOVERY_COOKIE, recoveryCookieValue('account-a'));
    getUserMock.mockResolvedValue({ data: { user: null } });

    const state = await resetPassword(INITIAL, form('new-password-1'));

    expect(updateUserMock).not.toHaveBeenCalled();
    expect(state.error).toBe(t.auth.errors.callbackFailed);
  });

  it('validates before touching the session', async () => {
    const state = await resetPassword(INITIAL, form('short'));

    expect(getUserMock).not.toHaveBeenCalled();
    expect(state.fieldErrors?.password).toEqual([t.auth.errors.passwordMin]);
  });

  it('reports mismatched confirmations without changing anything', async () => {
    cookieJar.set(RECOVERY_COOKIE, recoveryCookieValue('account-a'));

    const state = await resetPassword(
      INITIAL,
      form('new-password-1', 'new-password-2'),
    );

    expect(updateUserMock).not.toHaveBeenCalled();
    expect(state.fieldErrors?.confirm).toEqual([t.auth.reset.mismatch]);
  });

  it('keeps the marker when the update itself fails, so the PT can retry', async () => {
    cookieJar.set(RECOVERY_COOKIE, recoveryCookieValue('account-a'));
    updateUserMock.mockResolvedValue({
      data: {},
      error: { message: 'weak password' },
    });

    const state = await resetPassword(INITIAL, form('new-password-1'));

    expect(state.error).toBe(t.auth.errors.callbackFailed);
    expect(cookieJar.get(RECOVERY_COOKIE)).toBe(recoveryCookieValue('account-a'));
  });
});
