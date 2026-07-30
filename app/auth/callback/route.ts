import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@/lib/supabase/server';
import { RECOVERY_COOKIE, RESET_PASSWORD_PATH } from '@/lib/auth/recovery';
import { safeNext } from '@/lib/auth/safe-next';

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'), url.origin);

  if (!code) {
    return NextResponse.redirect(new URL('/sign-in?error=missing_code', url.origin));
  }

  const supabase = await createServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL('/sign-in?error=callback_failed', url.origin));
  }

  // Mark this as a genuine recovery session so /reset-password will accept it.
  // Scoped to the recovery redirect only; short-lived and cleared on success.
  if (next === RESET_PASSWORD_PATH) {
    const store = await cookies();
    store.set(RECOVERY_COOKIE, '1', {
      path: '/',
      maxAge: 600,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
