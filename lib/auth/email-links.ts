import { logger } from '@/lib/log';

/**
 * The `redirect_to` handed to GoTrue when asking it to send an auth email.
 *
 * It is *not* the source of truth for the URL the PT clicks. Both templates in
 * supabase/templates/ build their own link from `{{ .SiteURL }}` and hardcode
 * the `type` (and, for recovery, `next`), so the project's Site URL decides
 * where the mail lands and this value is ignored for those two mails.
 *
 * It still has to agree with Site URL. GoTrue silently falls back to Site URL
 * when `redirect_to` is missing from the project's redirect allowlist, and
 * nothing in either system reports the drift — which is why app/page.tsx has to
 * forward a stray token off `/`. Keep NEXT_PUBLIC_APP_URL and the Supabase
 * Site URL pointing at the same origin; the warning below is the only signal
 * we can raise from this side.
 */
export function emailRedirectUrl(path: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    logger.warn(
      'auth.app_url_missing',
      'NEXT_PUBLIC_APP_URL is unset — auth mail will fall back to the Supabase Site URL',
      { path },
    );
  }
  return `${appUrl}${path}`;
}

/** Landing path for a password-recovery mail. */
export const CONFIRM_RECOVERY_PATH = '/auth/confirm?next=/reset-password';

/** Landing path for a signup-confirmation mail. */
export const CONFIRM_SIGNUP_PATH = '/auth/confirm';
