import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { getPlan, PLAN_IDS } from '@/lib/billing/plans';
import {
  DISCLOSED_AI_PROVIDERS,
  disclosedAiProviderNames,
  providerFromModelId,
} from '../ai-providers';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) =>
    createElement('a', { href }, children),
}));

// Imported after the mock (vi.mock is hoisted) — both pages link across
// languages through next/link.
import PrivacyPage from '../page';
import EnglishPrivacyPage from '../../en/privacy/page';

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

  it('publishes the disclosure in both language versions of the policy', () => {
    const versions = [
      renderToStaticMarkup(PrivacyPage()),
      renderToStaticMarkup(EnglishPrivacyPage()),
    ];

    for (const markup of versions) {
      for (const name of Object.values(DISCLOSED_AI_PROVIDERS)) {
        // The guard above is only worth anything if the disclosure actually
        // reaches the published page — in Albanian as well as English.
        expect(markup).toContain(name);
      }
    }
  });
});
