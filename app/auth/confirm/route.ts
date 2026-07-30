import { NextResponse, type NextRequest } from 'next/server';
import {
  LINK_FAILED,
  classifyAuthError,
  linkErrorFromQuery,
} from '@/lib/auth/link-errors';
import { RESET_PASSWORD_PATH, stampRecoveryCookie } from '@/lib/auth/recovery';
import { safeNext } from '@/lib/auth/safe-next';
import { createServerClient } from '@/lib/supabase/server';

/**
 * Landing route for emailed links (recovery, signup confirmation).
 *
 * verifyOtp() consumes a token hash minted by GoTrue and needs nothing from the
 * browser that requested the mail, so the link still works when it is opened in
 * the Gmail app's webview, on a phone, or on another machine. The PKCE `code`
 * exchange in /auth/callback cannot do that — its verifier is a cookie in the
 * requesting browser — which is why email links come here instead.
 */

/** The email link types GoTrue mints; anything else never reaches Supabase. */
const EMAIL_OTP_TYPES = [
  'recovery',
  'signup',
  'invite',
  'magiclink',
  'email',
  'email_change',
] as const;

type EmailOtpType = (typeof EMAIL_OTP_TYPES)[number];

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return EMAIL_OTP_TYPES.includes(value as EmailOtpType);
}

function signInError(code: string, origin: string) {
  return NextResponse.redirect(new URL(`/sign-in?error=${code}`, origin));
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const params = url.searchParams;
  const next = safeNext(params.get('next'), url.origin);

  // GoTrue already refused the link and bounced back with its own error params.
  const upstream = linkErrorFromQuery(params);
  if (upstream) return signInError(upstream, url.origin);

  const tokenHash = params.get('token_hash');
  const type = params.get('type');

  // Mail already sitting in a PT's inbox — and the hosted project until its
  // templates are switched over — still arrives with a PKCE `code`. Hand those
  // to the callback rather than failing them.
  if (!tokenHash && params.get('code')) {
    return NextResponse.redirect(
      new URL(`/auth/callback${url.search}`, url.origin),
    );
  }

  if (!tokenHash || !isEmailOtpType(type)) {
    return signInError(LINK_FAILED, url.origin);
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error) return signInError(classifyAuthError(error), url.origin);

  // Same short-lived marker /auth/callback stamps: /reset-password refuses to
  // change a password without it, so this flow must satisfy the gate rather
  // than route around it.
  if (type === 'recovery') {
    await stampRecoveryCookie();
    // Derive the destination from the VERIFIED link type, not from `next`. The
    // hosted recovery template is retyped by hand in the Supabase dashboard, and
    // a dropped `&next=/reset-password` would otherwise land the PT on /today
    // with a live session, a 10-minute cookie ticking away, and no in-app way to
    // set a password — verified but still locked out.
    return NextResponse.redirect(new URL(RESET_PASSWORD_PATH, url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
