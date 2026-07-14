import { describe, expect, it } from 'vitest';
import { planRenewalActions } from '../billing-renewal-monitor';

const DAY = 86_400_000;
// Fixed expiry; `now` is placed at day-offsets around it.
const EXPIRES = new Date('2026-06-15T12:00:00.000Z');
const at = (dayOffset: number) =>
  new Date(EXPIRES.getTime() + dayOffset * DAY);

const types = (now: Date) =>
  planRenewalActions({ planExpiresAt: EXPIRES }, now).map((d) =>
    d.type === 'renewal_due' ? `renewal_due:${d.offset}` : d.type,
  );

describe('planRenewalActions', () => {
  it('fires nothing before the 5-day reminder window', () => {
    expect(types(at(-6))).toEqual([]);
  });

  it('fires the 5-day reminder from exactly −5d until expiry', () => {
    expect(types(at(-5))).toEqual(['renewal_due:5']);
    expect(types(at(-1))).toEqual(['renewal_due:5']);
  });

  it('fires the day-0 reminder + grace on the expiry day', () => {
    expect(types(at(0))).toEqual(['renewal_due:0', 'grace_started']);
  });

  it('stays in grace (no downgrade) inside the 3-day window', () => {
    const result = types(at(2));
    expect(result).toContain('grace_started');
    expect(result).not.toContain('downgrade');
  });

  it('downgrades once the grace window has fully elapsed', () => {
    expect(types(at(3))).toEqual(['renewal_due:0', 'downgrade']);
    expect(types(at(10))).toEqual(['renewal_due:0', 'downgrade']);
  });

  it('never acts on a lifetime PT', () => {
    expect(
      planRenewalActions({ planExpiresAt: EXPIRES, planLifetime: true }, at(10)),
    ).toEqual([]);
  });

  it('never acts on an expiry-less row', () => {
    expect(planRenewalActions({ planExpiresAt: null }, at(10))).toEqual([]);
  });
});
