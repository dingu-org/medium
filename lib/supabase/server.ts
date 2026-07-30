import { createServerClient as createSsrClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseAnonKey, supabaseUrl } from './env';

export async function createServerClient() {
  const cookieStore = await cookies();

  return createSsrClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot mutate cookies; middleware/route handlers can.
          // Safe to ignore here — Supabase will retry from a writable context.
        }
      },
    },
  });
}
