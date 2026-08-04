import { getPlan, type PlanId, type ReasoningEffort } from '@/lib/billing/plans';
import { resolveAppEnv, type AppEnv } from '@/lib/env/app-env';

type ModelEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * OpenRouter provider-routing constraints, resolved per environment.
 *
 * `zdr` + `data_collection: 'deny'` are a **production** requirement: it is the
 * only environment that processes patient data, so it is the only one bound by
 * the privacy commitments in the policy and DPA. Development and preview run
 * against a local Supabase stack and QA fixtures respectively — no patient data
 * ever reaches them — and the free models they use publish no ZDR-compliant
 * endpoint, so requiring it there would simply 404 every turn.
 *
 * `assertProductionPrivacy` below is the guard that keeps this from drifting.
 */
export type ProviderPrivacy = {
  allow_fallbacks: boolean;
  data_collection?: 'deny';
  zdr?: true;
};

const PRIVACY_BY_ENV: Record<AppEnv, ProviderPrivacy> = {
  development: { allow_fallbacks: true },
  preview: { allow_fallbacks: true },
  production: { allow_fallbacks: true, data_collection: 'deny', zdr: true },
};

/**
 * Production must never lose its privacy routing. Called at module load so a
 * bad edit fails the build and every test run, not a patient conversation.
 */
export function assertProductionPrivacy(
  privacy: ProviderPrivacy = PRIVACY_BY_ENV.production,
): void {
  if (privacy.zdr !== true || privacy.data_collection !== 'deny') {
    throw new Error(
      'Production provider routing must set zdr: true and data_collection: ' +
        "'deny' — patient conversations may not be retained or trained on.",
    );
  }
}
assertProductionPrivacy();

export type ResolvedModelConfig = {
  primary: string;
  fallbacks: string[];
  reasoningEffort?: ReasoningEffort;
  privacy: ProviderPrivacy;
};

/**
 * Resolve the model config for a plan in an environment.
 *
 * One mechanism everywhere: the plan's per-environment table in
 * `lib/billing/plans.ts` is the source of truth for *every* environment
 * (production → paid model + paid fallback, development/preview → free model,
 * no fallback), and the provider routing above is resolved alongside it. There
 * is deliberately no environment-specific code path and no per-environment
 * model env var — those produced a differently *shaped* request outside
 * production (no fallback routing, no reasoning effort) and made the
 * production behaviour untestable anywhere else.
 *
 * `OPENROUTER_MODEL_OVERRIDE` is the single remaining escape hatch, and it
 * behaves identically in all three environments: it swaps the primary model id
 * and leaves the environment's fallbacks, effort, and privacy routing intact.
 *
 * Environment identity comes from `appEnv()`, never `NODE_ENV` — Vercel builds
 * Preview with `NODE_ENV=production`.
 */
export function selectModelForPlan(
  plan: PlanId,
  env: ModelEnvironment = process.env,
  appEnv: AppEnv = resolveAppEnv(env),
): ResolvedModelConfig {
  const base = getPlan(plan).model[appEnv];
  const privacy = PRIVACY_BY_ENV[appEnv];
  const override = env.OPENROUTER_MODEL_OVERRIDE?.trim();

  return {
    primary: override || base.primary,
    fallbacks: [...base.fallbacks],
    reasoningEffort: base.reasoningEffort,
    privacy,
  };
}
