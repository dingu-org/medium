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
 * PKCE landing route. Google OAuth starts and finishes in the same browser, so
 * the code verifier cookie is always there and the exchange is the right, safer
 * mechanism. Emailed links go to /auth/confirm instead — but this route keeps
 * accepting recovery/confirmation codes so mail already in a PT's inbox (and
 * the hosted project until its templates are switched over) still works.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'), url.origin);

  const upstream = linkErrorFromQuery(url.searchParams);
  if (upstream) {
    return NextResponse.redirect(
      new URL(`/sign-in?error=${upstream}`, url.origin),
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(`/sign-in?error=${LINK_FAILED}`, url.origin),
    );
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`/sign-in?error=${classifyAuthError(error)}`, url.origin),
    );
  }

  // Mark this as a genuine recovery session so /reset-password will accept it.
  // Scoped to the recovery redirect only; short-lived and cleared on success.
  if (next === RESET_PASSWORD_PATH) await stampRecoveryCookie();

  return NextResponse.redirect(new URL(next, url.origin));
}
