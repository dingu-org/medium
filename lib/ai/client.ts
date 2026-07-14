import {
  createOpenRouter,
  type OpenRouterChatSettings,
} from '@openrouter/ai-sdk-provider';
import type { ResolvedModelConfig } from '@/lib/ai/models';

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  throw new Error('OPENROUTER_API_KEY is required');
}

// Privacy invariants (Phase 16 hard requirement): zero data retention and no
// provider-side training on patient conversations. Every request must carry
// these — never build settings objects that bypass this constant.
export const OPENROUTER_PROVIDER_SETTINGS = {
  allow_fallbacks: true,
  data_collection: 'deny',
  zdr: true,
} as const;

export const OPENROUTER_MODEL_SETTINGS = {
  provider: OPENROUTER_PROVIDER_SETTINGS,
  usage: { include: true },
} satisfies OpenRouterChatSettings;

/**
 * Per-plan request settings (Phase 16 C1): OpenRouter model-fallback routing
 * (`models` array) and reasoning effort layered on top of the locked privacy
 * settings. An env-override config (no fallbacks, no reasoning effort) yields
 * exactly the legacy request shape.
 */
export function buildModelSettings(
  config: ResolvedModelConfig,
): OpenRouterChatSettings {
  const settings: OpenRouterChatSettings = {
    provider: OPENROUTER_PROVIDER_SETTINGS,
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

export function getOpenRouterModel(
  modelId: string,
  settings: OpenRouterChatSettings = OPENROUTER_MODEL_SETTINGS,
) {
  return openrouter(modelId, settings);
}
