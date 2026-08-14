import { describe, expect, it } from 'vitest';
import { computeExtendedExpiry } from '@/lib/billing/payments';
import { testNowUtc } from '@/tests/support/clock';

// Only the year is derived. The months are the subject: the +1 month and +1 year
// steps have to be checked against hand-computed calendar answers, and the Jan 31
// case exists precisely to pin the clamp onto the last day of February.
const Y = testNowUtc().getUTCFullYear();
const utc = (year: number, month: number, day: number, hour = 0) =>
  new Date(Date.UTC(year, month - 1, day, hour));
/** Day 0 of March is the last day of February — 28 or 29, whichever it is. */
const lastOfFebruary = new Date(Date.UTC(Y, 2, 0));

const NOW = utc(Y, 7, 14, 12);

describe('computeExtendedExpiry', () => {
  it('extends from now when there is no current expiry (monthly)', () => {
    expect(computeExtendedExpiry(null, 'monthly', NOW).toISOString()).toBe(
      utc(Y, 8, 14, 12).toISOString(),
    );
  });

  it('extends from now when there is no current expiry (yearly)', () => {
    expect(computeExtendedExpiry(null, 'yearly', NOW).toISOString()).toBe(
      utc(Y + 1, 7, 14, 12).toISOString(),
    );
  });

  it('extends from a future expiry so renewing early loses no days (monthly)', () => {
    const future = utc(Y, 9, 1);
    expect(computeExtendedExpiry(future, 'monthly', NOW).toISOString()).toBe(
      utc(Y, 10, 1).toISOString(),
    );
  });

  it('extends from a future expiry (yearly)', () => {
    const future = utc(Y, 9, 1);
    expect(computeExtendedExpiry(future, 'yearly', NOW).toISOString()).toBe(
      utc(Y + 1, 9, 1).toISOString(),
    );
  });

  it('extends from now when the current expiry is in the past', () => {
    const past = utc(Y, 1, 1);
    expect(computeExtendedExpiry(past, 'monthly', NOW).toISOString()).toBe(
      utc(Y, 8, 14, 12).toISOString(),
    );
  });

  it('uses UTC calendar arithmetic and clamps month ends', () => {
    const jan31 = utc(Y, 1, 31);
    expect(computeExtendedExpiry(null, 'monthly', jan31).toISOString()).toBe(
      lastOfFebruary.toISOString(),
    );
  });
});
