import { t } from '@/lib/i18n';

/**
 * Failure codes the auth routes hand to `/sign-in?error=…`.
 *
 * An emailed link fails for two materially different reasons and the PT needs
 * to know which: an expired or already-used link is routine and is fixed by
 * asking for a new one, anything else is a genuine fault. Both banners link
 * back to /forgot-password so the PT is never dead-ended.
 */
export const LINK_EXPIRED = 'link_expired';
export const LINK_FAILED = 'link_failed';

/** Banner copy for a `?error=` param, or null when there is nothing to show. */
export function linkErrorMessage(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  return code === LINK_EXPIRED
    ? t.auth.signIn.linkExpired
    : t.auth.signIn.linkFailed;
}

/** Narrows a Supabase auth failure to one of the two codes above. */
export function classifyAuthError(
  error: { code?: string; message?: string } | null | undefined,
): string {
  if (error?.code === 'otp_expired') return LINK_EXPIRED;
  return /expired/i.test(error?.message ?? '') ? LINK_EXPIRED : LINK_FAILED;
}

/**
 * GoTrue rejects a bad link on its own side and bounces the PT back to the
 * redirect target carrying `?error=access_denied&error_code=otp_expired`
 * instead of a token, so the routes classify that before trying to verify.
 */
export function linkErrorFromQuery(params: URLSearchParams): string | null {
  const code = params.get('error_code') ?? params.get('error');
  if (!code) return null;
  return /expired/i.test(code) ? LINK_EXPIRED : LINK_FAILED;
}
