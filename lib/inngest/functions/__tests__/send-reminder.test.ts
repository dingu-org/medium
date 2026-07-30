import { describe, expect, it } from 'vitest';
import { tierLimit } from '../send-reminder';

describe('tierLimit', () => {
  it.each([
    ['TIER_50', 50],
    ['TIER_250', 250],
    ['TIER_1K', 1_000],
    ['TIER_10K', 10_000],
    ['TIER_100K', 100_000],
    ['tier_1k', 1_000],
    [' TIER_1K ', 1_000],
  ] as const)('maps %s to a limit of %i', (tier, limit) => {
    expect(tierLimit(tier)).toBe(limit);
  });

  it.each(['TIER_UNLIMITED', 'UNLIMITED', null, '', 'TIER_UNKNOWN', 'garbage'])(
    'treats %s as uncapped',
    (tier) => {
      expect(tierLimit(tier)).toBeNull();
    },
  );
});
