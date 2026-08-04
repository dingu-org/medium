import { getPlan, type PlanId, type ReasoningEffort } from '@/lib/billing/plans';
import { resolveAppEnv, type AppEnv } from '@/lib/env/app-env';

type ModelEnvironment = Readonly<Record<string, string | undefined>>;

export type ResolvedModelConfig = {
  primary: string;
  fallbacks: string[];
  reasoningEffort?: ReasoningEffort;
};

function resolveEnvModelId(
  env: ModelEnvironment,
  appEnv: AppEnv,
): string | null {
  const override = env.OPENROUTER_MODEL_OVERRIDE?.trim();
  if (override) return override;

  // Keyed on the app environment, not NODE_ENV: Vercel builds Preview with
  // NODE_ENV=production, so the old check sent every preview turn to the paid
  // production model. Preview shares development's free model.
  const envName =
    appEnv === 'production' ? 'OPENROUTER_PROD_MODEL' : 'OPENROUTER_DEV_MODEL';
  return env[envName]?.trim() || null;
}

/**
 * Resolve the model config for a plan (Phase 16 C1). The plan's config in
 * `lib/billing/plans.ts` is the source of truth, but the env model vars
 * (OPENROUTER_MODEL_OVERRIDE / OPENROUTER_{PROD,DEV}_MODEL) win while set —
 * the dev escape hatch and the zero-behavior-change guarantee for this chunk.
 * An env-selected model runs single-model with no reasoning parameter (it may
 * not be a reasoning model), i.e. exactly the pre-C1 request shape. The plan
 * config (haiku-4.5 + gpt-5-mini fallback, high reasoning) is live in
 * production as of the 2026-08-04 model cutover — `OPENROUTER_PROD_MODEL` is
 * deliberately unset there, because an env-selected model carries no reasoning
 * effort and would silently drop the configured `high`. Development and
 * preview still resolve `OPENROUTER_DEV_MODEL` (a free model) through the env
 * path, so they keep the legacy no-reasoning shape.
 */
export function selectModelForPlan(
  plan: PlanId,
  env: ModelEnvironment = process.env,
  appEnv: AppEnv = resolveAppEnv(env),
): ResolvedModelConfig {
  const envModelId = resolveEnvModelId(env, appEnv);
  if (envModelId) {
    return { primary: envModelId, fallbacks: [], reasoningEffort: undefined };
  }
  const base = getPlan(plan).model;
  return {
    primary: base.primary,
    fallbacks: [...base.fallbacks],
    reasoningEffort: base.reasoningEffort,
  };
}
