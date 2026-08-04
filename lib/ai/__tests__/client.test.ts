import { beforeEach, describe, expect, it, vi } from 'vitest';
import { selectModelForPlan } from '../models';

const PROD_PRIVACY = {
  allow_fallbacks: true,
  data_collection: 'deny',
  zdr: true,
} as const;

const NON_PROD_PRIVACY = { allow_fallbacks: true } as const;

describe('OpenRouter client', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('throws when OPENROUTER_API_KEY is missing', async () => {
    const original = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    await expect(import('../client')).rejects.toThrow(
      /OPENROUTER_API_KEY is required/,
    );
    process.env.OPENROUTER_API_KEY = original;
  });

  it('carries privacy routing from the resolved config, not a global default', async () => {
    process.env.OPENROUTER_API_KEY = 'test';
    const { buildModelSettings } = await import('../client');

    expect(
      buildModelSettings(selectModelForPlan('free', {}, 'production')).provider,
    ).toEqual(PROD_PRIVACY);
    expect(
      buildModelSettings(selectModelForPlan('free', {}, 'preview')).provider,
    ).toEqual(NON_PROD_PRIVACY);
  });

  it('builds the production request: paid fallback routing + reasoning + zdr', async () => {
    process.env.OPENROUTER_API_KEY = 'test';
    const { buildModelSettings } = await import('../client');
    const settings = buildModelSettings(
      selectModelForPlan('free', {}, 'production'),
    );
    expect(settings).toEqual({
      provider: PROD_PRIVACY,
      usage: { include: true },
      models: ['anthropic/claude-haiku-4.5', 'openai/gpt-5-mini'],
      reasoning: { effort: 'high' },
    });
  });

  it('builds dev/preview the same way: free model, no paid fallback, no zdr', async () => {
    process.env.OPENROUTER_API_KEY = 'test';
    const { buildModelSettings } = await import('../client');

    for (const appEnv of ['development', 'preview'] as const) {
      const config = selectModelForPlan('free', {}, appEnv);
      const settings = buildModelSettings(config);

      expect(config.primary.endsWith(':free')).toBe(true);
      // A paid fallback here would bill real money the moment the free
      // endpoint rate-limits.
      expect(settings).not.toHaveProperty('models');
      expect(settings.provider).toEqual(NON_PROD_PRIVACY);
      // Effort applies uniformly — same request shape as production.
      expect(settings.reasoning).toEqual({ effort: 'high' });
    }
  });

  it('omits the models array when there are no fallbacks', async () => {
    process.env.OPENROUTER_API_KEY = 'test';
    const { buildModelSettings } = await import('../client');
    const settings = buildModelSettings({
      primary: 'custom/model',
      fallbacks: [],
      reasoningEffort: undefined,
      privacy: NON_PROD_PRIVACY,
    });
    expect(settings).not.toHaveProperty('models');
    expect(settings).not.toHaveProperty('reasoning');
  });
});
