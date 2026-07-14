import { beforeEach, describe, expect, it, vi } from 'vitest';

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

  it('locks privacy, fallbacks, and usage accounting in the default settings', async () => {
    process.env.OPENROUTER_API_KEY = 'test';
    const { OPENROUTER_MODEL_SETTINGS } = await import('../client');
    expect(OPENROUTER_MODEL_SETTINGS).toEqual({
      provider: {
        allow_fallbacks: true,
        data_collection: 'deny',
        zdr: true,
      },
      usage: { include: true },
    });
  });

  it('buildModelSettings adds fallback routing + reasoning while preserving zdr and data_collection', async () => {
    process.env.OPENROUTER_API_KEY = 'test';
    const { buildModelSettings } = await import('../client');
    const settings = buildModelSettings({
      primary: 'anthropic/claude-haiku-4.5',
      fallbacks: ['openai/gpt-5-mini'],
      reasoningEffort: 'low',
    });
    expect(settings).toEqual({
      provider: {
        allow_fallbacks: true,
        data_collection: 'deny',
        zdr: true,
      },
      usage: { include: true },
      models: ['anthropic/claude-haiku-4.5', 'openai/gpt-5-mini'],
      reasoning: { effort: 'low' },
    });
    // The privacy invariants must survive any settings construction path.
    expect(settings.provider?.zdr).toBe(true);
    expect(settings.provider?.data_collection).toBe('deny');
  });

  it('buildModelSettings on an env-override config reproduces the legacy request shape', async () => {
    process.env.OPENROUTER_API_KEY = 'test';
    const { OPENROUTER_MODEL_SETTINGS, buildModelSettings } = await import(
      '../client'
    );
    const settings = buildModelSettings({
      primary: 'custom/model',
      fallbacks: [],
      reasoningEffort: undefined,
    });
    expect(settings).toEqual(OPENROUTER_MODEL_SETTINGS);
    expect(settings).not.toHaveProperty('models');
    expect(settings).not.toHaveProperty('reasoning');
    expect(settings.provider?.zdr).toBe(true);
    expect(settings.provider?.data_collection).toBe('deny');
  });
});
