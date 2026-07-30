import { describe, expect, it } from 'vitest';
import { getPlan, PLAN_IDS } from '@/lib/billing/plans';
import {
  DISCLOSED_AI_PROVIDERS,
  disclosedAiProviderNames,
  providerFromModelId,
} from '../ai-providers';

describe('disclosed AI providers', () => {
  it('covers every upstream provider a plan can route inference to', () => {
    const disclosed = Object.keys(DISCLOSED_AI_PROVIDERS);

    for (const plan of PLAN_IDS) {
      const { primary, fallbacks } = getPlan(plan).model;
      for (const modelId of [primary, ...fallbacks]) {
        // Fails until the privacy policy + subprocessor doc name the provider.
        expect(disclosed).toContain(providerFromModelId(modelId));
      }
    }
  });

  it('formats the provider list for the policy prose', () => {
    expect(disclosedAiProviderNames()).toBe('Anthropic and OpenAI');
  });

  it('reads the provider off an OpenRouter model id', () => {
    expect(providerFromModelId('anthropic/claude-haiku-4.5')).toBe('anthropic');
    expect(providerFromModelId('gpt-5-mini')).toBe('gpt-5-mini');
  });
});
