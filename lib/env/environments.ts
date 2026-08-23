import type { AppEnv } from './app-env';

/**
 * The non-secret identity of each environment.
 *
 * Only one thing is declared here, and it is the one thing that must never be
 * wrong: which Supabase project an environment is allowed to talk to. Until
 * 2026-08-04 all three environments shared a single project, so a preview
 * deploy read and wrote live customer rows. Declaring the mapping in the repo
 * turns that from an invisible configuration state into a boot-time assertion
 * (`lib/env/guard.ts`).
 *
 * Project refs are not secrets — they are the subdomain of the public Supabase
 * URL. Everything that *is* a secret stays in the environment; this file only
 * records which secrets are the right ones.
 *
 * Expected values for the rest of the matrix (app URL, POK merchant mode, AI
 * model tier, Meta app) are documented in `docs/environments.md` and enforced
 * by presence/drift checks in `scripts/check-env.ts` rather than here — those
 * change during launch, the database mapping does not.
 */
export type EnvironmentIdentity = {
  /**
   * Supabase project ref, i.e. `<ref>.supabase.co`. `local` is the sentinel
   * for the `supabase start` Docker stack, whose URL is a loopback address and
   * carries no ref. `null` means "not provisioned yet" — the guard fails
   * closed on it, which is what makes an unfinished setup impossible to ship.
   */
  supabaseProjectRef: string | null;
  /** Canonical origin. Preview deployments also answer on per-deploy URLs. */
  appUrl: string;
};

export const ENVIRONMENTS: Readonly<Record<AppEnv, EnvironmentIdentity>> = {
  development: {
    supabaseProjectRef: 'local',
    appUrl: 'http://localhost:3000',
  },
  preview: {
    supabaseProjectRef: 'nnqucuyrsqkhboiczhed',
    appUrl: 'https://medium-preview.dingu.org',
  },
  production: {
    supabaseProjectRef: 'fozwkvyydqgpduxxgatm',
    appUrl: 'https://medium.dingu.org',
  },
};

/** Loopback hosts are the local `supabase start` stack, which has no ref. */
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/**
 * Reduce a Supabase URL to the identity the manifest declares: the project ref
 * for a hosted project, the `local` sentinel for the Docker stack. Returns
 * `null` for anything unparseable so callers report "unrecognised" rather than
 * silently comparing garbage.
 */
export function supabaseProjectRefFromUrl(
  url: string | undefined,
): string | null {
  if (!url) return null;
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return null;
  }
  if (LOCAL_HOSTS.has(host)) return 'local';
  const [ref, ...rest] = host.split('.');
  // `<ref>.supabase.co`, and `<ref>.supabase.internal` / regional variants.
  if (ref && rest.length >= 2 && rest[0] === 'supabase') return ref;
  return null;
}

/**
 * The same reduction for a Postgres connection string. Supabase's pooler host
 * (`aws-1-eu-central-1.pooler.supabase.com`) does not carry the ref — it lives
 * in the username, as `postgres.<ref>` — so the host-based path above cannot be
 * reused. Direct connections do use `db.<ref>.supabase.co`.
 */
export function supabaseProjectRefFromDatabaseUrl(
  url: string | undefined,
): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (LOCAL_HOSTS.has(parsed.hostname)) return 'local';
  const [, pooledRef] = decodeURIComponent(parsed.username).split('.');
  if (pooledRef) return pooledRef;
  const [prefix, ref, ...rest] = parsed.hostname.split('.');
  if (prefix === 'db' && ref && rest[0] === 'supabase') return ref;
  return null;
}
