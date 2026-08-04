import { describe, expect, it } from 'vitest';
import {
  EXPIRY_GRACE_DAYS,
  PLANS,
  RENEWAL_REMINDER_DAYS_BEFORE,
  RETENTION_CLAMP_GRACE_DAYS,
  USAGE_WARN_RATIO,
  parseBillingPlanOverrides,
  resolvePlans,
} from '@/lib/billing/plans';

describe('PLANS config', () => {
  it('free has the documented limits and no price', () => {
    expect(PLANS.free).toMatchObject({
      conversationsPerMonth: 30,
      remindersPerMonth: 10,
      maxActiveServices: 1,
      retentionMaxDays: 30,
      customAssistantIdentity: false,
      price: null,
    });
  });

  it('solo has the documented limits and ALL pricing in whole Lekë', () => {
    expect(PLANS.solo).toMatchObject({
      conversationsPerMonth: 400,
      remindersPerMonth: 250,
      maxActiveServices: null,
      retentionMaxDays: 365,
      customAssistantIdentity: true,
      price: { currency: 'ALL', monthly: 2500, yearly: 25000 },
    });
  });

  it('both plans declare the same model table for every environment', () => {
    for (const plan of [PLANS.free, PLANS.solo]) {
      expect(plan.model.production).toEqual({
        primary: 'anthropic/claude-haiku-4.5',
        fallbacks: ['openai/gpt-5-mini'],
        reasoningEffort: 'high',
      });
      // Development and preview share one free config — no paid fallback, so a
      // rate-limited free endpoint can never spill into billed usage.
      for (const appEnv of ['development', 'preview'] as const) {
        expect(plan.model[appEnv].primary.endsWith(':free')).toBe(true);
        expect(plan.model[appEnv].fallbacks).toEqual([]);
        expect(plan.model[appEnv].reasoningEffort).toBe('high');
      }
    }
  });

  it('exposes the documented billing constants', () => {
    expect(USAGE_WARN_RATIO).toBe(0.8);
    expect(EXPIRY_GRACE_DAYS).toBe(3);
    expect(RETENTION_CLAMP_GRACE_DAYS).toBe(30);
    expect(RENEWAL_REMINDER_DAYS_BEFORE).toEqual([5, 0]);
  });
});

describe('parseBillingPlanOverrides', () => {
  it('treats undefined and blank as no overrides', () => {
    expect(parseBillingPlanOverrides(undefined)).toEqual({});
    expect(parseBillingPlanOverrides('')).toEqual({});
    expect(parseBillingPlanOverrides('   ')).toEqual({});
  });

  it('throws on invalid JSON', () => {
    expect(() => parseBillingPlanOverrides('{nope')).toThrow(
      /BILLING_PLAN_OVERRIDES is not valid JSON/,
    );
  });

  it('throws on a valid-JSON payload with the wrong shape', () => {
    expect(() =>
      parseBillingPlanOverrides('{"free":{"conversationsPerMonth":"lots"}}'),
    ).toThrow();
    expect(() =>
      parseBillingPlanOverrides('{"solo":{"price":{"currency":"EUR"}}}'),
    ).toThrow();
  });

  it('accepts a partial override', () => {
    expect(
      parseBillingPlanOverrides('{"free":{"remindersPerMonth":25}}'),
    ).toEqual({ free: { remindersPerMonth: 25 } });
  });
});

describe('resolvePlans', () => {
  it('returns the base config with no overrides', () => {
    expect(resolvePlans(undefined)).toEqual(PLANS);
  });

  it('deep-merges a partial override, leaving everything else intact', () => {
    const plans = resolvePlans('{"free":{"remindersPerMonth":25}}');
    expect(plans.free.remindersPerMonth).toBe(25);
    expect(plans.free.conversationsPerMonth).toBe(30);
    expect(plans.free.model).toEqual(PLANS.free.model);
    expect(plans.solo).toEqual(PLANS.solo);
  });

  it('replaces a nested model fallbacks array for one environment only', () => {
    const plans = resolvePlans(
      '{"solo":{"model":{"production":{"fallbacks":["x/one","x/two"]}}}}',
    );
    expect(plans.solo.model.production).toEqual({
      primary: 'anthropic/claude-haiku-4.5',
      fallbacks: ['x/one', 'x/two'],
      reasoningEffort: 'high',
    });
    // The other environments, and the other plan, are untouched.
    expect(plans.solo.model.preview).toEqual(PLANS.solo.model.preview);
    expect(plans.free.model.production.fallbacks).toEqual(['openai/gpt-5-mini']);
  });

  it('allows nulling the price and unlimiting services', () => {
    const plans = resolvePlans(
      '{"free":{"maxActiveServices":null},"solo":{"price":null}}',
    );
    expect(plans.free.maxActiveServices).toBeNull();
    expect(plans.solo.price).toBeNull();
  });
});
