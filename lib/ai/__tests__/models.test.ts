import { describe, expect, it } from 'vitest';
import { assertProductionPrivacy, selectModelForPlan } from '../models';

const PROD_PRIVACY = {
  allow_fallbacks: true,
  data_collection: 'deny',
  zdr: true,
};
const NON_PROD_PRIVACY = { allow_fallbacks: true };

describe('selectModelForPlan', () => {
  it('resolves production to the paid model, paid fallback, and zdr routing', () => {
    expect(selectModelForPlan('free', {}, 'production')).toEqual({
      primary: 'anthropic/claude-haiku-4.5',
      fallbacks: ['openai/gpt-5-mini'],
      reasoningEffort: undefined,
      privacy: PROD_PRIVACY,
    });
  });

  // Same mechanism as production — same shape, different values. The old
  // env-var path produced a structurally different request outside production
  // (no fallback routing, no reasoning effort), so production behaviour could
  // not be exercised anywhere else.
  it.each(['development', 'preview'] as const)(
    'resolves %s through the same table: free model, no fallback, no zdr',
    (appEnv) => {
      const config = selectModelForPlan('free', {}, appEnv);
      expect(config.primary.endsWith(':free')).toBe(true);
      expect(config.fallbacks).toEqual([]);
      expect(config.reasoningEffort).toBeUndefined();
      expect(config.privacy).toEqual(NON_PROD_PRIVACY);
    },
  );

  // A reasoning budget is derived from the request's max_tokens and floored at
  // 1024, so any effort at all is unsafe until the engine's maxOutputTokens
  // clears that floor — thinking otherwise consumes the whole allowance and the
  // turn returns no patient-facing text. Guards every environment, not just
  // production: dev and preview send the same request shape.
  it.each(['development', 'preview', 'production'] as const)(
    'sets no reasoning effort in %s while maxOutputTokens is below the 1024 floor',
    (appEnv) => {
      expect(selectModelForPlan('free', {}, appEnv).reasoningEffort).toBeUndefined();
      expect(selectModelForPlan('solo', {}, appEnv).reasoningEffort).toBeUndefined();
    },
  );

  // Vercel builds Preview with NODE_ENV=production, so keying on NODE_ENV sent
  // preview turns to the paid production model. This is the regression guard.
  it('never resolves preview to the production model', () => {
    const preview = selectModelForPlan('free', {}, 'preview');
    const production = selectModelForPlan('free', {}, 'production');
    expect(preview.primary).not.toBe(production.primary);
    expect(preview.fallbacks).toEqual([]);
    expect(preview.privacy.zdr).toBeUndefined();
  });

  it('returns the same config for solo (one model table for all plans today)', () => {
    expect(selectModelForPlan('solo', {}, 'development')).toEqual(
      selectModelForPlan('free', {}, 'development'),
    );
  });

  it('override swaps only the primary, keeping the environment fallbacks, effort, and privacy', () => {
    expect(
      selectModelForPlan(
        'free',
        { OPENROUTER_MODEL_OVERRIDE: 'custom/model' },
        'production',
      ),
    ).toEqual({
      primary: 'custom/model',
      fallbacks: ['openai/gpt-5-mini'],
      reasoningEffort: undefined,
      privacy: PROD_PRIVACY,
    });
  });

  it('applies the override identically outside production', () => {
    const config = selectModelForPlan(
      'free',
      { OPENROUTER_MODEL_OVERRIDE: 'custom/model' },
      'preview',
    );
    expect(config.primary).toBe('custom/model');
    expect(config.fallbacks).toEqual([]);
    expect(config.privacy).toEqual(NON_PROD_PRIVACY);
  });

  it('ignores a blank override and keeps the environment default', () => {
    expect(
      selectModelForPlan(
        'free',
        { OPENROUTER_MODEL_OVERRIDE: '  ' },
        'development',
      ).primary.endsWith(':free'),
    ).toBe(true);
  });

  it('derives the environment from the passed env record when not given', () => {
    expect(selectModelForPlan('free', { APP_ENV: 'production' }).primary).toBe(
      'anthropic/claude-haiku-4.5',
    );
    expect(
      selectModelForPlan('free', { APP_ENV: 'preview' }).primary.endsWith(
        ':free',
      ),
    ).toBe(true);
  });
});

describe('assertProductionPrivacy', () => {
  it('passes for the configured production routing', () => {
    expect(() => assertProductionPrivacy()).not.toThrow();
  });

  it.each([
    { allow_fallbacks: true },
    { allow_fallbacks: true, zdr: true } as const,
    { allow_fallbacks: true, data_collection: 'deny' } as const,
  ])('throws when production routing drops zdr or data_collection (%o)', (p) => {
    expect(() => assertProductionPrivacy(p)).toThrow(/zdr: true/);
  });
});
