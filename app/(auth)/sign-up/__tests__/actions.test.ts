import { beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/lib/i18n';
import { signUp } from '../actions';

const { signUpMock } = vi.hoisted(() => ({ signUpMock: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({ auth: { signUp: signUpMock } }),
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

const initial = { error: null, fieldErrors: null };

function credentials(email = 'pt@biznesi.al', password = 'fjalekalim1') {
  const data = new FormData();
  data.set('email', email);
  data.set('password', password);
  return data;
}

beforeEach(() => {
  signUpMock.mockReset();
});

describe('signUp', () => {
  it('goes straight to onboarding when confirmations are off and a session came back', async () => {
    signUpMock.mockResolvedValue({
      data: { user: { id: 'pt-a' }, session: { access_token: 'jwt' } },
      error: null,
    });
    await expect(signUp(initial, credentials())).rejects.toThrow(
      'REDIRECT:/onboarding',
    );
  });

  it('asks the PT to confirm their email when no session came back', async () => {
    signUpMock.mockResolvedValue({
      data: { user: { id: 'pt-a' }, session: null },
      error: null,
    });
    await expect(signUp(initial, credentials())).rejects.toThrow(
      'REDIRECT:/sign-in?confirm=1',
    );
  });

  it('maps an existing-account error to the taken-email message', async () => {
    signUpMock.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'User already registered' },
    });
    await expect(signUp(initial, credentials())).resolves.toEqual({
      error: t.auth.signUp.emailTaken,
      fieldErrors: null,
    });
  });

  it('rejects a short password without calling Supabase', async () => {
    const state = await signUp(initial, credentials('pt@biznesi.al', 'short'));
    expect(state.fieldErrors?.password?.[0]).toBe(t.auth.errors.passwordMin);
    expect(signUpMock).not.toHaveBeenCalled();
  });
});
