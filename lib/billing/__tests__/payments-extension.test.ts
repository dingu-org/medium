import { describe, expect, it } from 'vitest';
import { computeExtendedExpiry } from '@/lib/billing/payments';

const NOW = new Date('2026-07-14T12:00:00.000Z');

describe('computeExtendedExpiry', () => {
  it('extends from now when there is no current expiry (monthly)', () => {
    expect(computeExtendedExpiry(null, 'monthly', NOW).toISOString()).toBe(
      '2026-08-14T12:00:00.000Z',
    );
  });

  it('extends from now when there is no current expiry (yearly)', () => {
    expect(computeExtendedExpiry(null, 'yearly', NOW).toISOString()).toBe(
      '2027-07-14T12:00:00.000Z',
    );
  });

  it('extends from a future expiry so renewing early loses no days (monthly)', () => {
    const future = new Date('2026-09-01T00:00:00.000Z');
    expect(computeExtendedExpiry(future, 'monthly', NOW).toISOString()).toBe(
      '2026-10-01T00:00:00.000Z',
    );
  });

  it('extends from a future expiry (yearly)', () => {
    const future = new Date('2026-09-01T00:00:00.000Z');
    expect(computeExtendedExpiry(future, 'yearly', NOW).toISOString()).toBe(
      '2027-09-01T00:00:00.000Z',
    );
  });

  it('extends from now when the current expiry is in the past', () => {
    const past = new Date('2026-01-01T00:00:00.000Z');
    expect(computeExtendedExpiry(past, 'monthly', NOW).toISOString()).toBe(
      '2026-08-14T12:00:00.000Z',
    );
  });

  it('uses UTC calendar arithmetic and clamps month ends', () => {
    const jan31 = new Date('2026-01-31T00:00:00.000Z');
    expect(computeExtendedExpiry(null, 'monthly', jan31).toISOString()).toBe(
      '2026-02-28T00:00:00.000Z',
    );
  });
});
