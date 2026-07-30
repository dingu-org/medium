import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  hasSupabaseConfig,
  supabaseAnonKey,
  supabaseUrl,
} from '@/lib/supabase/env';

/**
 * Pages that must keep rendering when Supabase config is missing: the landing,
 * the legal and help documents Meta App Review and the privacy notice point at,
 * and the auth screens. None of them carries a session, so skipping the refresh
 * costs nothing.
 */
const PUBLIC_PATHS = new Set(['/', '/sign-in', '/sign-up', '/forgot-password']);
const PUBLIC_PREFIXES = ['/privacy', '/terms', '/help', '/en/'];

function isPublicPath(pathname: string): boolean {
  return (
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
  );
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Middleware is the only writable cookie context on a plain page render
  // (lib/supabase/server.ts has to swallow setAll in Server Components), so
  // missing config here would silently stop refreshing sessions until the
  // rotated refresh token gets replayed and revoked. Fail loudly — but only
  // where a session is actually in play. NEXT_PUBLIC_* are inlined at build
  // time and have already gone missing from one Vercel build (progress.md,
  // 2026-05-14); a repeat must not take the public pages down with it.
  if (!hasSupabaseConfig() && isPublicPath(request.nextUrl.pathname)) {
    return response;
  }

  const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  await supabase.auth.getUser();

  return response;
}

export const config = {
  // /auth/confirm and /auth/callback are excluded deliberately: they mint the
  // session themselves, and a refresh attempt on the stale cookies they arrive
  // with can emit session-clearing Set-Cookie headers that merge with the fresh
  // ones the route handler just wrote.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/inngest|api/webhooks|auth/confirm|auth/callback|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
