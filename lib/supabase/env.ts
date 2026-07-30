/**
 * Single accessor for the two Supabase values every auth client needs.
 *
 * The browser bundle can only read `NEXT_PUBLIC_*` names, so that pair is the
 * canonical one: middleware, the server client and the browser client all read
 * it from here, and a missing value throws in one place instead of each caller
 * inventing its own name (or, worse, silently skipping session refresh).
 *
 * The unprefixed `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` stay separate —
 * they belong to the service-role client (lib/supabase/service.ts) and scripts,
 * which must never be reachable from the client bundle.
 */

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function supabaseUrl(): string {
  // Inlined at build time for client bundles — must stay a literal member read.
  return required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL);
}

export function supabaseAnonKey(): string {
  return required(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/**
 * Whether a client can be built at all. Callers that must keep working without
 * one — the public pages, which carry no session — ask first instead of
 * catching; everyone else calls the accessors above and gets the loud throw.
 */
export function hasSupabaseConfig(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
