import { describe, expect, it } from 'vitest';
import { selectModelForPlan } from '../models';

describe('selectModelForPlan', () => {
  it('returns the plan config (haiku + fallback + high effort) when no env model is set', () => {
    expect(selectModelForPlan('free', {}, 'production')).toEqual({
      primary: 'anthropic/claude-haiku-4.5',
      fallbacks: ['openai/gpt-5-mini'],
      reasoningEffort: 'high',
    });
  });

  it('returns the same model config for solo (one model for all plans today)', () => {
    expect(selectModelForPlan('solo', {}, 'development')).toEqual(
      selectModelForPlan('free', {}, 'development'),
    );
  });

  it('env override wins and strips fallbacks + reasoning (legacy request shape)', () => {
    expect(
      selectModelForPlan(
        'free',
        {
          OPENROUTER_MODEL_OVERRIDE: 'custom/model',
          OPENROUTER_DEV_MODEL: 'dev/model',
          OPENROUTER_PROD_MODEL: 'prod/model',
        },
        'production',
      ),
    ).toEqual({
      primary: 'custom/model',
      fallbacks: [],
      reasoningEffort: undefined,
    });
  });

  it('uses the production env model in production', () => {
    expect(
      selectModelForPlan(
        'free',
        { OPENROUTER_PROD_MODEL: 'prod/model' },
        'production',
      ),
    ).toEqual({
      primary: 'prod/model',
      fallbacks: [],
      reasoningEffort: undefined,
    });
  });

  it('uses the development env model outside production', () => {
    expect(
      selectModelForPlan(
        'free',
        { OPENROUTER_DEV_MODEL: 'dev/model' },
        'development',
      ).primary,
    ).toBe('dev/model');
  });

  // Vercel builds Preview with NODE_ENV=production, so keying on NODE_ENV sent
  // preview turns to the paid production model. Preview is a development-tier
  // consumer of the model config.
  it('uses the development env model in preview, not the production one', () => {
    expect(
      selectModelForPlan(
        'free',
        { OPENROUTER_DEV_MODEL: 'dev/model', OPENROUTER_PROD_MODEL: 'prod/model' },
        'preview',
      ).primary,
    ).toBe('dev/model');
  });

  it('derives the environment from the passed env record when not given', () => {
    expect(
      selectModelForPlan('free', {
        APP_ENV: 'production',
        OPENROUTER_DEV_MODEL: 'dev/model',
        OPENROUTER_PROD_MODEL: 'prod/model',
      }).primary,
    ).toBe('prod/model');
  });

  it('ignores blank env values and falls back to the plan config', () => {
    expect(
      selectModelForPlan(
        'free',
        { OPENROUTER_MODEL_OVERRIDE: '  ', OPENROUTER_DEV_MODEL: '' },
        'development',
      ).primary,
    ).toBe('anthropic/claude-haiku-4.5');
  });
});
