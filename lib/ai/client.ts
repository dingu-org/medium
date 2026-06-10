import {
  createOpenRouter,
  type OpenRouterChatSettings,
} from '@openrouter/ai-sdk-provider';

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  throw new Error('OPENROUTER_API_KEY is required');
}

export const OPENROUTER_MODEL_SETTINGS = {
  provider: {
    allow_fallbacks: true,
    require_parameters: true,
    data_collection: 'deny',
    zdr: true,
  },
  usage: { include: true },
} satisfies OpenRouterChatSettings;

const openrouter = createOpenRouter({
  apiKey,
  compatibility: 'strict',
  appName: 'Medium',
  appUrl: process.env.NEXT_PUBLIC_APP_URL,
});

export function getOpenRouterModel(modelId: string) {
  return openrouter(modelId, OPENROUTER_MODEL_SETTINGS);
}
