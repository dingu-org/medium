import { getPlan, type PlanId, type ReasoningEffort } from '@/lib/billing/plans';

type ModelEnvironment = Readonly<Record<string, string | undefined>>;

export type ResolvedModelConfig = {
  primary: string;
  fallbacks: string[];
  reasoningEffort?: ReasoningEffort;
};

function resolveEnvModelId(
  env: ModelEnvironment,
  nodeEnv: string | undefined,
): string | null {
  const override = env.OPENROUTER_MODEL_OVERRIDE?.trim();
  if (override) return override;

  const envName =
    nodeEnv === 'production' ? 'OPENROUTER_PROD_MODEL' : 'OPENROUTER_DEV_MODEL';
  return env[envName]?.trim() || null;
}

/**
 * Resolve the model config for a plan (Phase 16 C1). The plan's config in
 * `lib/billing/plans.ts` is the source of truth, but the env model vars
 * (OPENROUTER_MODEL_OVERRIDE / OPENROUTER_{PROD,DEV}_MODEL) win while set —
 * the dev escape hatch and the zero-behavior-change guarantee for this chunk.
 * An env-selected model runs single-model with no reasoning parameter (it may
 * not be a reasoning model), i.e. exactly the pre-C1 request shape. The plan
 * config (haiku-4.5 + gpt-5-mini fallback, low reasoning) goes live at the
 * model cutover, when the env vars are removed.
 */
export function selectModelForPlan(
  plan: PlanId,
  env: ModelEnvironment = process.env,
  nodeEnv: string | undefined = env.NODE_ENV,
): ResolvedModelConfig {
  const envModelId = resolveEnvModelId(env, nodeEnv);
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
