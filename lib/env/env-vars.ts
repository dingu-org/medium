import { APP_ENVS, type AppEnv } from './app-env';

/**
 * The environment-variable contract, as data.
 *
 * Two checks read this table (`scripts/check-env.ts`):
 *
 * - **presence** — every var `requiredIn` the resolved environment must be set
 *   and non-empty. Catches the failure mode from progress.md 2026-05-14, where
 *   a missing `NEXT_PUBLIC_*` shipped a build that could not refresh sessions.
 * - **drift** — every var marked `mustDiffer` must hold a *different* value in
 *   Preview than in Production. This is the check that would have caught the
 *   original defect: all 34 variables were one shared value across both
 *   targets, so preview deploys wrote to the production database.
 *
 * `mustDiffer` is not "nice to have". Each one is a var where a shared value
 * means a preview deploy can read, write, bill, message, or decrypt something
 * belonging to production.
 */
export type EnvVarSpec = {
  name: string;
  /** Environments where the value must be present and non-empty. */
  requiredIn: readonly AppEnv[];
  /** Preview and Production must not share this value. */
  mustDiffer: boolean;
  /** Never print the value — `check-env` reports set/unset and a digest only. */
  secret: boolean;
  description: string;
};

const ALL = APP_ENVS;
const DEPLOYED = ['preview', 'production'] as const satisfies readonly AppEnv[];
const NONE = [] as const satisfies readonly AppEnv[];

export const ENV_VARS: readonly EnvVarSpec[] = [
  // ---------------------------------------------------------------- database
  {
    name: 'DATABASE_URL',
    requiredIn: ALL,
    mustDiffer: true,
    secret: true,
    description: 'Postgres connection string. Pooler host in deployed envs.',
  },
  {
    name: 'SUPABASE_URL',
    requiredIn: ALL,
    mustDiffer: true,
    secret: false,
    description: 'Service-role client base URL (server only).',
  },
  {
    name: 'SUPABASE_ANON_KEY',
    requiredIn: ALL,
    mustDiffer: true,
    secret: true,
    description: 'Anon key for server-side use.',
  },
  {
    name: 'SUPABASE_SERVICE_ROLE_KEY',
    requiredIn: ALL,
    mustDiffer: true,
    secret: true,
    description: 'Bypasses RLS. Must never reach the client bundle.',
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_URL',
    requiredIn: ALL,
    mustDiffer: true,
    secret: false,
    description: 'Canonical pair with the anon key; see lib/supabase/env.ts.',
  },
  {
    name: 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    requiredIn: ALL,
    mustDiffer: true,
    secret: false,
    description: 'Inlined into the browser bundle at build time.',
  },

  // ------------------------------------------------------------------- app
  {
    name: 'NEXT_PUBLIC_APP_URL',
    requiredIn: ALL,
    mustDiffer: true,
    secret: false,
    description: 'Canonical origin; Meta OAuth redirects are derived from it.',
  },
  {
    name: 'TOKEN_ENCRYPTION_KEY',
    requiredIn: ALL,
    mustDiffer: true,
    secret: true,
    description:
      'Encrypts stored Meta tokens at rest. Shared across environments, a ' +
      'preview database dump would decrypt production tokens.',
  },
  {
    name: 'TOKEN_ENCRYPTION_KEY_NEXT',
    requiredIn: NONE,
    mustDiffer: true,
    secret: true,
    description: 'Set only during a key rotation (scripts/rotate-token-key.ts).',
  },
  {
    name: 'ADMIN_EMAILS',
    requiredIn: NONE,
    mustDiffer: false,
    secret: false,
    description: 'Comma-separated operators allowed on /admin. Unset ⇒ 404.',
  },

  // -------------------------------------------------------------- background
  {
    name: 'INNGEST_EVENT_KEY',
    requiredIn: ALL,
    mustDiffer: true,
    secret: true,
    description: 'Per Inngest environment. Sharing merges preview + prod runs.',
  },
  {
    name: 'INNGEST_SIGNING_KEY',
    requiredIn: DEPLOYED,
    mustDiffer: true,
    secret: true,
    description: 'Signs the /api/inngest handshake. Per Inngest environment.',
  },

  // ----------------------------------------------------------------- whatsapp
  {
    name: 'META_APP_ID',
    requiredIn: ALL,
    mustDiffer: true,
    secret: false,
    description: 'Preview uses the Meta *test* app, production the live one.',
  },
  {
    name: 'META_APP_SECRET',
    requiredIn: ALL,
    mustDiffer: true,
    secret: true,
    description: 'Verifies inbound webhook signatures.',
  },
  {
    name: 'META_WEBHOOK_VERIFY_TOKEN',
    requiredIn: ALL,
    mustDiffer: true,
    secret: true,
    description: 'Webhook subscription challenge, per Meta app.',
  },
  // Deployed-only: development has no Meta app, and the Settings UI
  // degrades gracefully when the pair is unset (read-models.ts checks it).
  {
    name: 'NEXT_PUBLIC_META_APP_ID',
    requiredIn: DEPLOYED,
    mustDiffer: true,
    secret: false,
    description: 'Mirrors META_APP_ID for the Embedded Signup JS SDK.',
  },
  {
    name: 'NEXT_PUBLIC_META_CONFIG_ID',
    requiredIn: DEPLOYED,
    mustDiffer: true,
    secret: false,
    description: 'Embedded Signup configuration, per Meta app.',
  },
  {
    name: 'META_SYSTEM_USER_TOKEN',
    requiredIn: NONE,
    mustDiffer: true,
    secret: true,
    description: 'Not read by application code today; kept for Graph tooling.',
  },
  {
    name: 'META_REDIRECT_URI',
    requiredIn: NONE,
    mustDiffer: true,
    secret: false,
    description:
      'Legacy — the route derives the redirect from NEXT_PUBLIC_APP_URL. Kept ' +
      'because the Meta app allow-list is configured against it.',
  },
  {
    name: 'META_RATE_CARD_OVERRIDES',
    requiredIn: NONE,
    mustDiffer: false,
    secret: false,
    description: 'JSON override of Meta per-conversation pricing.',
  },

  // ----------------------------------------------------------------------- ai
  {
    name: 'OPENROUTER_API_KEY',
    requiredIn: ALL,
    mustDiffer: false,
    secret: true,
    description:
      'One key is acceptable; split it if you want per-environment spend ' +
      'attribution on the OpenRouter activity dashboard.',
  },
  {
    name: 'OPENROUTER_DEV_MODEL',
    requiredIn: NONE,
    mustDiffer: false,
    secret: false,
    description: 'Model used in development and preview. Keep it a :free model.',
  },
  {
    name: 'OPENROUTER_PROD_MODEL',
    requiredIn: NONE,
    mustDiffer: false,
    secret: false,
    description:
      'Production-only escape hatch. Removing it hands model choice back to ' +
      'lib/billing/plans.ts (the pre-launch model cutover).',
  },
  {
    name: 'OPENROUTER_MODEL_OVERRIDE',
    requiredIn: NONE,
    mustDiffer: false,
    secret: false,
    description: 'Wins over both of the above, in every environment.',
  },

  // ------------------------------------------------------------------ payments
  {
    name: 'POK_ENV',
    requiredIn: NONE,
    mustDiffer: true,
    secret: false,
    description: "'staging' in development + preview, 'production' in prod.",
  },
  {
    name: 'POK_MERCHANT_ID',
    requiredIn: NONE,
    mustDiffer: true,
    secret: true,
    description: 'Per POK environment. Live checkout stays gated until set.',
  },
  {
    name: 'POK_KEY_ID',
    requiredIn: NONE,
    mustDiffer: true,
    secret: true,
    description: 'Per POK environment.',
  },
  {
    name: 'POK_KEY_SECRET',
    requiredIn: NONE,
    mustDiffer: true,
    secret: true,
    description: 'Per POK environment.',
  },
  {
    name: 'POK_API_BASE',
    requiredIn: NONE,
    mustDiffer: false,
    secret: false,
    description: 'Host override; normally derived from POK_ENV.',
  },
  {
    name: 'BILLING_PLAN_OVERRIDES',
    requiredIn: NONE,
    mustDiffer: false,
    secret: false,
    description: 'JSON override of plan limits, for testing caps.',
  },

  // --------------------------------------------------------------------- push
  {
    name: 'VAPID_PUBLIC_KEY',
    requiredIn: ALL,
    mustDiffer: true,
    secret: false,
    description:
      'Subscriptions are bound to the keypair that created them, and each ' +
      'environment has its own push_subscriptions rows.',
  },
  {
    name: 'VAPID_PRIVATE_KEY',
    requiredIn: ALL,
    mustDiffer: true,
    secret: true,
    description: 'Pairs with VAPID_PUBLIC_KEY.',
  },
  {
    name: 'VAPID_SUBJECT',
    requiredIn: ALL,
    mustDiffer: false,
    secret: false,
    description: 'mailto: contact sent to the push service.',
  },
];

export const ENV_VARS_BY_NAME: ReadonlyMap<string, EnvVarSpec> = new Map(
  ENV_VARS.map((spec) => [spec.name, spec]),
);

export function requiredVarsFor(env: AppEnv): readonly EnvVarSpec[] {
  return ENV_VARS.filter((spec) => spec.requiredIn.includes(env));
}

export function mustDifferVars(): readonly EnvVarSpec[] {
  return ENV_VARS.filter((spec) => spec.mustDiffer);
}
