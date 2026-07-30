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

/**
 * The marker carries the id of the user it was minted for. A bare flag survives
 * a sign-out on a shared device, so PT A could click a reset link, abandon the
 * form and sign out, and PT B signing in inside the 10-minute window would find
 * the gate already open — updateUser() would then change *B's* password.
 */
export function recoveryCookieValue(userId: string): string {
  return `user:${userId}`;
}

/** Marks the current session as coming from a verified recovery link. */
export async function stampRecoveryCookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(RECOVERY_COOKIE, recoveryCookieValue(userId), {
    path: '/',
    maxAge: RECOVERY_COOKIE_MAX_AGE,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

/** Drops the marker; the session it belonged to is gone. */
export async function clearRecoveryCookie(): Promise<void> {
  const store = await cookies();
  store.delete(RECOVERY_COOKIE);
}

/** True only when the marker was minted for this exact user. */
export async function hasRecoveryMarker(userId: string): Promise<boolean> {
  const store = await cookies();
  return store.get(RECOVERY_COOKIE)?.value === recoveryCookieValue(userId);
}
