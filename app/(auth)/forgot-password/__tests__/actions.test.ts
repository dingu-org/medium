import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/lib/i18n';
import { logger } from '@/lib/log';
import { requestPasswordReset } from '../actions';

const { resetMock } = vi.hoisted(() => ({ resetMock: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: { resetPasswordForEmail: resetMock },
  }),
}));

const initial = { error: null, fieldErrors: null, success: false };

function form(email = 'account@biznesi.al') {
  const data = new FormData();
  data.set('email', email);
  return data;
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com');
  resetMock.mockReset();
  resetMock.mockResolvedValue({ data: {}, error: null });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('requestPasswordReset', () => {
  it('sends the PT to the token-hash route, which works in any browser', async () => {
    await requestPasswordReset(initial, form());

    expect(resetMock).toHaveBeenCalledWith('account@biznesi.al', {
      redirectTo: 'https://app.example.com/auth/confirm?next=/reset-password',
    });
  });

  it('reports success without leaking whether the email exists', async () => {
    await expect(requestPasswordReset(initial, form())).resolves.toEqual({
      error: null,
      fieldErrors: null,
      success: true,
    });
  });

  it('rejects an invalid email without calling Supabase', async () => {
    const state = await requestPasswordReset(initial, form('not-an-email'));

    expect(state.fieldErrors?.email?.[0]).toBe(t.auth.errors.emailInvalid);
    expect(resetMock).not.toHaveBeenCalled();
  });

  // The 2/hour cap and a rejected redirect_to both fail here. The PT still gets
  // the anti-enumeration answer, so the operator is the only one who can find
  // out that the inbox they were told to check will stay empty.
  it('logs a refused send while still reporting success', async () => {
    const logged = vi.spyOn(logger, 'error').mockImplementation(() => {});
    resetMock.mockResolvedValue({
      data: {},
      error: {
        name: 'AuthApiError',
        status: 429,
        code: 'over_email_send_rate_limit',
        message: 'For security purposes, you can only request this once',
      },
    });

    const state = await requestPasswordReset(initial, form());

    expect(state).toEqual({ error: null, fieldErrors: null, success: true });
    expect(logged).toHaveBeenCalledWith(
      'auth.reset_email_failed',
      expect.any(String),
      expect.objectContaining({ errorCode: 'over_email_send_rate_limit' }),
    );
    logged.mockRestore();
  });
});
