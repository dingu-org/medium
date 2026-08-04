/**
 * Next calls `register()` once per runtime when the server starts — including
 * the build's prerender pass — which makes it the earliest point where a
 * misconfigured deployment can be stopped before it serves a request or writes
 * a row.
 *
 * Only the Node runtime is checked. The Edge runtime (middleware) gets a
 * narrowed env at build time and would report spurious "missing" variables;
 * anything it needs is already asserted by `lib/supabase/env.ts` at the point
 * of use.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const { assertEnvironmentIntegrity } = await import('@/lib/env/guard');
  assertEnvironmentIntegrity();
}
