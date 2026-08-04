/**
 * The one place that answers "which of the three environments am I?".
 *
 * `NODE_ENV` cannot answer it: Vercel builds and runs Preview deployments with
 * `NODE_ENV=production`, so every `NODE_ENV === 'production'` branch already
 * treats Preview as Production. That is correct for the handful of decisions
 * that are really about "is this an optimized build served over HTTPS"
 * (`Secure` cookies, HMR-safe module caches, the service worker) — those keep
 * reading `NODE_ENV` and are deliberately left alone. It is wrong for every
 * decision about *identity*: which database, which Meta app, which payment
 * merchant, which AI model tier. Those read `appEnv()`.
 */

export const APP_ENVS = ['development', 'preview', 'production'] as const;

export type AppEnv = (typeof APP_ENVS)[number];

type EnvRecord = Readonly<Record<string, string | undefined>>;

export function isAppEnv(value: string | undefined): value is AppEnv {
  return APP_ENVS.includes(value as AppEnv);
}

/**
 * Inlined at build time for client bundles — Next only substitutes a
 * `NEXT_PUBLIC_*` value when the property access is written out literally, so
 * reading it off a passed-in record (as `resolveAppEnv` does for its other
 * candidates) would yield `undefined` in the browser. `next.config.ts` sets
 * this from `VERCEL_ENV` at build time; see the `env` block there.
 */
const BUILD_APP_ENV = process.env.NEXT_PUBLIC_APP_ENV;

/**
 * Resolution order, most explicit first:
 *
 * 1. `APP_ENV` — the deliberate local override (`pnpm dev:test`, one-off runs
 *    against a deployed database, the `check:env` CLI targeting another env).
 * 2. `NEXT_PUBLIC_APP_ENV` — same value, readable from the browser.
 * 3. The build-time inlined copy of (2), which is the only one that survives
 *    into the client bundle.
 * 4. `VERCEL_ENV` — set by the platform. Its three values are exactly our
 *    three names, which is why this file reuses one type guard for both.
 * 5. `development` — the default. Chosen so that a missing signal degrades to
 *    the *least* privileged environment: an unconfigured process must never
 *    decide it is production and start reaching for production behaviour.
 */
export function resolveAppEnv(env: EnvRecord = process.env): AppEnv {
  const candidates = [
    env.APP_ENV,
    env.NEXT_PUBLIC_APP_ENV,
    BUILD_APP_ENV,
    env.VERCEL_ENV,
  ];
  for (const candidate of candidates) {
    if (isAppEnv(candidate)) return candidate;
  }
  return 'development';
}

/** `resolveAppEnv` against the ambient process environment. */
export function appEnv(): AppEnv {
  return resolveAppEnv();
}
