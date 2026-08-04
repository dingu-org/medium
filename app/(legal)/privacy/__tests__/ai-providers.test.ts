import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

// Imported after the mock (vi.mock is hoisted) — every page links across
// languages through next/link.
import PrivacyPage from '../page';
import EnglishPrivacyPage from '../../en/privacy/page';
import TermsPage from '../../terms/page';
import EnglishTermsPage from '../../en/terms/page';

const subprocessorAnnex = readFileSync(
  join(process.cwd(), 'docs/gdpr/subprocessors.md'),
  'utf8',
);

// Production only, deliberately: it is the sole environment that processes
// patient data, so it is the sole environment whose upstream providers belong
// in the privacy policy and the DPA subprocessor annex. Development and
// preview run a free model against local/QA fixtures and disclose nothing.
function configuredModelIds(): string[] {
  return [
    ...new Set(
      PLAN_IDS.flatMap((plan) => {
        const { primary, fallbacks } = getPlan(plan).model.production;
        return [primary, ...fallbacks];
      }),
    ),
  ];
}

describe('disclosed AI providers', () => {
  it('covers every upstream provider a plan can route inference to', () => {
    const disclosed = Object.keys(DISCLOSED_AI_PROVIDERS);

    for (const plan of PLAN_IDS) {
      const { primary, fallbacks } = getPlan(plan).model.production;
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

  it('publishes the disclosure in every language version of the policy and terms', () => {
    const versions = [
      renderToStaticMarkup(PrivacyPage()),
      renderToStaticMarkup(EnglishPrivacyPage()),
      renderToStaticMarkup(TermsPage()),
      renderToStaticMarkup(EnglishTermsPage()),
    ];

    for (const markup of versions) {
      for (const name of Object.values(DISCLOSED_AI_PROVIDERS)) {
        // The guard above is only worth anything if the disclosure actually
        // reaches the published documents — the terms list third-party
        // providers too, and used to name a different set from the policy.
        expect(markup).toContain(name);
      }
    }
  });

  // The subprocessor annex is what the DPA (docs/gdpr/dpa-template.md)
  // incorporates by reference, so an undisclosed provider or a stale model id
  // there is an Art. 28 gap even when the public pages are correct.
  it('names every provider and model in the DPA subprocessor annex', () => {
    for (const name of Object.values(DISCLOSED_AI_PROVIDERS)) {
      expect(subprocessorAnnex).toContain(name);
    }
    for (const modelId of configuredModelIds()) {
      expect(subprocessorAnnex).toContain(modelId);
    }
  });

  it('does not leave a superseded model id in the annex', () => {
    const annexModelIds =
      subprocessorAnnex.match(/`[a-z0-9-]+\/[a-z0-9.-]+`/g) ?? [];
    const configured = configuredModelIds().map((id) => `\`${id}\``);

    expect(annexModelIds.length).toBeGreaterThan(0);
    expect([...new Set(annexModelIds)].sort()).toEqual(configured.sort());
  });
});
