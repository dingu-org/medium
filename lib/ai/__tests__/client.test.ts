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

  it('locks privacy, fallbacks, and usage accounting', async () => {
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
});
