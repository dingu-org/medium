import { cookies } from 'next/headers';

/**
 * Password-recovery gate. The auth routes set {@link RECOVERY_COOKIE} only after
 * verifying a genuine recovery link — either the token-hash link handled by
 * /auth/confirm or the older PKCE code handled by /auth/callback — and the
 * reset-password page and action require it so an ordinary authenticated
 * session (e.g. a bookmarked tab on a shared device) cannot silently overwrite
 * the account password without going through recovery.
 */
export const RECOVERY_COOKIE = 'pw-recovery';
export const RESET_PASSWORD_PATH = '/reset-password';

/** Long enough to pick a new password, short enough to be useless afterwards. */
const RECOVERY_COOKIE_MAX_AGE = 600;

/** Marks the current session as coming from a verified recovery link. */
export async function stampRecoveryCookie(): Promise<void> {
  const store = await cookies();
  store.set(RECOVERY_COOKIE, '1', {
    path: '/',
    maxAge: RECOVERY_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}
