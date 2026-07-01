/**
 * Password-recovery gate. The auth callback sets {@link RECOVERY_COOKIE} only
 * after exchanging a genuine recovery code for a session and redirecting to
 * {@link RESET_PASSWORD_PATH}; the reset-password page and action require it so
 * an ordinary authenticated session (e.g. a bookmarked tab on a shared device)
 * cannot silently overwrite the account password without going through recovery.
 */
export const RECOVERY_COOKIE = 'pw-recovery';
export const RESET_PASSWORD_PATH = '/reset-password';
