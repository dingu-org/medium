import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { supabaseAnonKey, supabaseUrl } from '@/lib/supabase/env';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Middleware is the only writable cookie context on a plain page render
  // (lib/supabase/server.ts has to swallow setAll in Server Components), so
  // missing config here would silently stop refreshing sessions until the
  // rotated refresh token gets replayed and revoked. Fail loudly instead.
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
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/inngest|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
