import { t } from '@/lib/i18n';

/**
 * Failure codes the auth routes hand to `/sign-in?error=…`.
 *
 * An emailed link fails for two materially different reasons and the PT needs
 * to know which: an expired or already-used link is routine and is fixed by
 * asking for a new one, anything else is a genuine fault. Both banners link
 * back to /forgot-password so the PT is never dead-ended.
 *
 * {@link OAUTH_CANCELLED} is not an email link at all — see
 * {@link oauthLandingErrorFromQuery} — and deliberately gets neither banner.
 */
export const LINK_EXPIRED = 'link_expired';
export const LINK_FAILED = 'link_failed';
export const OAUTH_CANCELLED = 'oauth_cancelled';

/** Banner copy for a `?error=` param, or null when there is nothing to show. */
export function linkErrorMessage(
  code: string | null | undefined,
): string | null {
  if (!code) return null;
  if (code === OAUTH_CANCELLED) return t.auth.errors.oauthFailed;
  return code === LINK_EXPIRED
    ? t.auth.signIn.linkExpired
    : t.auth.signIn.linkFailed;
}

/**
 * Whether the banner for `code` should offer a fresh recovery link. Only an
 * emailed link is fixed by requesting another one; sending someone who just
 * closed the Google consent screen into password recovery is a wrong turn.
 */
export function offersFreshLink(code: string | null | undefined): boolean {
  return Boolean(linkErrorMessage(code)) && code !== OAUTH_CANCELLED;
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

/**
 * Same, for /auth/callback — which is the Google OAuth landing route as well as
 * the legacy email-`code` route. A PT who declines the Google consent screen
 * comes back through GoTrue with `access_denied` (or a bare `server_error`) and
 * no expiry code; a link GoTrue refused always carries one. Treating the former
 * as a broken email link both misdiagnoses it and pushes someone who merely
 * cancelled a sign-in into password recovery.
 */
export function oauthLandingErrorFromQuery(
  params: URLSearchParams,
): string | null {
  const upstream = linkErrorFromQuery(params);
  if (!upstream) return null;
  return upstream === LINK_EXPIRED ? LINK_EXPIRED : OAUTH_CANCELLED;
}
