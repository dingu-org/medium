import { describe, expect, it } from 'vitest';
import {
  checkoutBannerTone,
  resolveCheckoutSlot,
  type BillingSnapshot,
} from '@/lib/billing/read-model';

const METER = { used: 0, limit: 30, warn: false };

/** A complete active-Solo snapshot; override any field per case. */
function snap(overrides: Partial<BillingSnapshot> = {}): BillingSnapshot {
  return {
    timezone: 'Europe/Tirane',
    plan: 'solo',
    storedPlan: 'solo',
    planLifetime: false,
    planExpiresAt: null,
    planDowngradedAt: null,
    state: 'active',
    daysLeft: null,
    conversations: METER,
    reminders: METER,
    receipts: [],
    currentPeriod: null,
    price: { monthly: 2500, yearly: 25000 },
    ...overrides,
  };
}

describe('resolveCheckoutSlot', () => {
  it('lifetime pilots are never sold to', () => {
    expect(resolveCheckoutSlot(snap({ planLifetime: true }))).toEqual({
      kind: 'none',
    });
  });

  it('no slot when Solo is not purchasable', () => {
    expect(resolveCheckoutSlot(snap({ price: null }))).toEqual({
      kind: 'none',
    });
  });

  it('free → upgrade with both periods, yearly favored', () => {
    expect(
      resolveCheckoutSlot(snap({ state: 'free', plan: 'free' })),
    ).toEqual({
      kind: 'upgrade',
      periods: ['monthly', 'yearly'],
      defaultPeriod: 'yearly',
    });
  });

  it('active monthly Solo → switch to yearly (upsell, no monthly option)', () => {
    expect(
      resolveCheckoutSlot(snap({ state: 'active', currentPeriod: 'monthly' })),
    ).toEqual({
      kind: 'switch',
      periods: ['yearly'],
      defaultPeriod: 'yearly',
    });
  });

  it('active yearly Solo → reassurance note, no form', () => {
    expect(
      resolveCheckoutSlot(snap({ state: 'active', currentPeriod: 'yearly' })),
    ).toEqual({ kind: 'reassure' });
  });

  it('active Solo with no paid order → no slot', () => {
    expect(
      resolveCheckoutSlot(snap({ state: 'active', currentPeriod: null })),
    ).toEqual({ kind: 'none' });
  });

  it('expiring monthly → renew with both periods, yearly favored', () => {
    expect(
      resolveCheckoutSlot(
        snap({ state: 'expiring', currentPeriod: 'monthly', daysLeft: 3 }),
      ),
    ).toEqual({
      kind: 'renew',
      periods: ['monthly', 'yearly'],
      defaultPeriod: 'yearly',
    });
  });

  it('expiring yearly → renew with both periods, yearly favored', () => {
    expect(
      resolveCheckoutSlot(
        snap({ state: 'expiring', currentPeriod: 'yearly', daysLeft: 3 }),
      ),
    ).toEqual({
      kind: 'renew',
      periods: ['monthly', 'yearly'],
      defaultPeriod: 'yearly',
    });
  });

  it('grace → renew with both periods, yearly favored', () => {
    expect(
      resolveCheckoutSlot(
        snap({ state: 'grace', currentPeriod: 'yearly', daysLeft: 2 }),
      ),
    ).toEqual({
      kind: 'renew',
      periods: ['monthly', 'yearly'],
      defaultPeriod: 'yearly',
    });
  });
});

describe('checkoutBannerTone', () => {
  it('celebrates only a settled payment', () => {
    expect(checkoutBannerTone('applied')).toBe('paid');
    expect(checkoutBannerTone('already_applied')).toBe('paid');
  });

  it('treats a POK 404 as pending, not as a failed payment', () => {
    // POK's read-after-write lag 404s the order for the first seconds after
    // checkout — exactly when POK redirects the customer back to this page. A
    // red "payment failed" for a PT who has just paid is the worst reading of
    // "POK has not caught up yet"; the reconcile cron settles it either way.
    expect(checkoutBannerTone('not_found')).toBe('pending');
    expect(checkoutBannerTone('pending')).toBe('pending');
  });

  it('shows failure only for a POK-confirmed failure, and nothing for unknown', () => {
    expect(checkoutBannerTone('failed')).toBe('failed');
    expect(checkoutBannerTone('unknown')).toBeNull();
  });
});
