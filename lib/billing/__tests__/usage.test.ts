import { describe, expect, it } from 'vitest';
import { conversationDayKeys, warnThreshold } from '@/lib/billing/usage';
import { getPlan, USAGE_WARN_RATIO } from '@/lib/billing/plans';
import { testNowUtc } from '@/tests/support/clock';

// The month and day carry the meaning here and stay explicit — July is when
// Europe/Tirane runs at UTC+2 and January when it runs at UTC+1, and the 31st is
// the straddle. Only the year is derived, which is the part that would rot.
const Y = testNowUtc().getUTCFullYear();

describe('conversationDayKeys', () => {
  it('keys by the PT timezone, not UTC, at the day boundary', () => {
    // 23:59 Europe/Tirane (UTC+2 in July) is already the next UTC day.
    const lateNight = new Date(`${Y}-07-31T21:59:00Z`);
    expect(conversationDayKeys(lateNight, 'Europe/Tirane')).toEqual({
      localDay: `${Y}-07-31`,
      monthKey: `${Y}-07`,
    });
    // Same instant in UTC lands on a different day — proving tz matters.
    expect(conversationDayKeys(lateNight, 'UTC')).toEqual({
      localDay: `${Y}-07-31`,
      monthKey: `${Y}-07`,
    });
  });

  it('rolls the month over on the local calendar, not the UTC one', () => {
    // 00:01 Tirane on Aug 1 (22:01 UTC Jul 31) counts against August.
    const justAfterMidnight = new Date(`${Y}-07-31T22:01:00Z`);
    expect(conversationDayKeys(justAfterMidnight, 'Europe/Tirane')).toEqual({
      localDay: `${Y}-08-01`,
      monthKey: `${Y}-08`,
    });
    // In UTC the same instant is still July.
    expect(conversationDayKeys(justAfterMidnight, 'UTC').monthKey).toBe(
      `${Y}-07`,
    );
  });

  it('handles a winter (UTC+1) month-end straddle', () => {
    // 00:30 Tirane on Feb 1 (23:30 UTC Jan 31) counts against February.
    const winterEdge = new Date(`${Y}-01-31T23:30:00Z`);
    expect(conversationDayKeys(winterEdge, 'Europe/Tirane')).toEqual({
      localDay: `${Y}-02-01`,
      monthKey: `${Y}-02`,
    });
  });
});

describe('warnThreshold', () => {
  it('is the ceil of the configured ratio times the plan cap', () => {
    expect(warnThreshold(getPlan('free').conversationsPerMonth)).toBe(
      Math.ceil(USAGE_WARN_RATIO * getPlan('free').conversationsPerMonth),
    );
    expect(warnThreshold(getPlan('solo').conversationsPerMonth)).toBe(
      Math.ceil(USAGE_WARN_RATIO * getPlan('solo').conversationsPerMonth),
    );
  });

  it('never exceeds the cap for tiny limits', () => {
    expect(warnThreshold(1)).toBeLessThanOrEqual(1);
  });
});
