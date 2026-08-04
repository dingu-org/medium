import {
  createOpenRouter,
  type OpenRouterChatSettings,
} from '@openrouter/ai-sdk-provider';
import type { ResolvedModelConfig } from '@/lib/ai/models';

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  throw new Error('OPENROUTER_API_KEY is required');
}

/**
 * Build the OpenRouter request settings from a resolved config.
 *
 * Everything environment-specific — provider/privacy routing, fallback list,
 * reasoning effort — is decided once in `selectModelForPlan` and carried on the
 * config, so this function has no environment knowledge and no branches per
 * environment. Production's `zdr` + `data_collection: 'deny'` arrive via
 * `config.privacy`, which `assertProductionPrivacy` guards at module load.
 */
export function buildModelSettings(
  config: ResolvedModelConfig,
): OpenRouterChatSettings {
  const settings: OpenRouterChatSettings = {
    provider: { ...config.privacy },
    usage: { include: true },
  };
  if (config.fallbacks.length > 0) {
    settings.models = [config.primary, ...config.fallbacks];
  }
  if (config.reasoningEffort) {
    settings.reasoning = { effort: config.reasoningEffort };
  }
  return settings;
}

const openrouter = createOpenRouter({
  apiKey,
  compatibility: 'strict',
  appName: 'Medium',
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
});

/**
 * Settings are required, deliberately: there is no default privacy posture to
 * fall back on. Callers pass `buildModelSettings(selectModelForPlan(...))` so
 * the routing always matches the environment the turn is running in.
 */
export function getOpenRouterModel(
  modelId: string,
  settings: OpenRouterChatSettings,
) {
  return openrouter(modelId, settings);
}
