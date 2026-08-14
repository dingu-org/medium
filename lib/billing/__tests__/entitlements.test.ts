import { describe, expect, it } from 'vitest';
import {
  effectiveAssistantIdentity,
  effectiveRetentionDays,
  resolveEffectivePlan,
  type BillingPt,
} from '@/lib/billing/entitlements';
import { testNowUtc } from '@/tests/support/clock';

const DAY_MS = 86_400_000;
// Derived: every fixture below is an offset from NOW, so the absolute date
// never mattered — only that it stays a stable instant across the file.
const NOW = testNowUtc();

function pt(overrides: Partial<BillingPt> = {}): BillingPt {
  return {
    plan: 'free',
    planLifetime: false,
    planExpiresAt: null,
    ...overrides,
  };
}

describe('resolveEffectivePlan', () => {
  it('lifetime → solo regardless of stored plan and expiry', () => {
    expect(
      resolveEffectivePlan(
        pt({ plan: 'free', planLifetime: true, planExpiresAt: null }),
        NOW,
      ),
    ).toBe('solo');
    expect(
      resolveEffectivePlan(
        pt({
          plan: 'solo',
          planLifetime: true,
          planExpiresAt: new Date(NOW.getTime() - 100 * DAY_MS),
        }),
        NOW,
      ),
    ).toBe('solo');
  });

  it('solo with a future expiry → solo', () => {
    expect(
      resolveEffectivePlan(
        pt({ plan: 'solo', planExpiresAt: new Date(NOW.getTime() + DAY_MS) }),
        NOW,
      ),
    ).toBe('solo');
  });

  it('solo exactly at the grace boundary (now == expiry + 3d) → solo', () => {
    expect(
      resolveEffectivePlan(
        pt({
          plan: 'solo',
          planExpiresAt: new Date(NOW.getTime() - 3 * DAY_MS),
        }),
        NOW,
      ),
    ).toBe('solo');
  });

  it('solo past the grace window (now > expiry + 3d) → free', () => {
    expect(
      resolveEffectivePlan(
        pt({
          plan: 'solo',
          planExpiresAt: new Date(NOW.getTime() - 3 * DAY_MS - 1),
        }),
        NOW,
      ),
    ).toBe('free');
    expect(
      resolveEffectivePlan(
        pt({
          plan: 'solo',
          planExpiresAt: new Date(NOW.getTime() - 4 * DAY_MS),
        }),
        NOW,
      ),
    ).toBe('free');
  });

  it('non-lifetime solo without an expiry → free (anomalous row, no entitlement)', () => {
    expect(resolveEffectivePlan(pt({ plan: 'solo' }), NOW)).toBe('free');
  });

  it('free stays free', () => {
    expect(resolveEffectivePlan(pt(), NOW)).toBe('free');
  });
});

describe('effectiveRetentionDays', () => {
  it('returns the stored setting when never downgraded', () => {
    expect(
      effectiveRetentionDays(pt({ retentionDays: 90 }), NOW),
    ).toBe(90);
  });

  it('returns the stored setting during the 30-day post-downgrade grace', () => {
    expect(
      effectiveRetentionDays(
        pt({
          retentionDays: 90,
          planDowngradedAt: new Date(NOW.getTime() - 29 * DAY_MS),
        }),
        NOW,
      ),
    ).toBe(90);
  });

  it('clamps to the plan max once the grace window has elapsed', () => {
    expect(
      effectiveRetentionDays(
        pt({
          retentionDays: 90,
          planDowngradedAt: new Date(NOW.getTime() - 30 * DAY_MS),
        }),
        NOW,
      ),
    ).toBe(30);
  });

  it('never raises a stored setting below the plan max', () => {
    expect(
      effectiveRetentionDays(
        pt({
          retentionDays: 20,
          planDowngradedAt: new Date(NOW.getTime() - 45 * DAY_MS),
        }),
        NOW,
      ),
    ).toBe(20);
  });

  it('clamps against the effective plan (lifetime solo keeps 365-day max)', () => {
    expect(
      effectiveRetentionDays(
        pt({
          retentionDays: 300,
          planLifetime: true,
          planDowngradedAt: new Date(NOW.getTime() - 45 * DAY_MS),
        }),
        NOW,
      ),
    ).toBe(300);
  });
});

describe('effectiveAssistantIdentity', () => {
  it('nulls the identity on free even when the PT has one stored', () => {
    expect(
      effectiveAssistantIdentity(
        pt({ aiName: 'Vita', aiGreeting: 'Përshëndetje!' }),
        NOW,
      ),
    ).toEqual({ aiName: null, aiGreeting: null });
  });

  it('passes the identity through on solo', () => {
    expect(
      effectiveAssistantIdentity(
        pt({
          plan: 'solo',
          planExpiresAt: new Date(NOW.getTime() + DAY_MS),
          aiName: 'Vita',
          aiGreeting: 'Përshëndetje!',
        }),
        NOW,
      ),
    ).toEqual({ aiName: 'Vita', aiGreeting: 'Përshëndetje!' });
  });

  it('passes the identity through on lifetime and normalizes missing fields to null', () => {
    expect(
      effectiveAssistantIdentity(pt({ planLifetime: true }), NOW),
    ).toEqual({ aiName: null, aiGreeting: null });
    expect(
      effectiveAssistantIdentity(
        pt({ planLifetime: true, aiName: 'Vita' }),
        NOW,
      ),
    ).toEqual({ aiName: 'Vita', aiGreeting: null });
  });
});
