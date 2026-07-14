import { describe, expect, it } from 'vitest';
import {
  BASE_META_RATE_CARD_MICRO_EUR,
  DEFAULT_META_CONVERSATION_COST_MICRO_EUR,
  META_PRICING_CATEGORIES,
  META_RATE_CARD_CURRENCY,
  META_RATE_CARD_MICRO_EUR,
  META_RATE_CARD_UNIT,
  META_RATE_CARD_UNKNOWN_CATEGORY_MICRO_EUR,
  META_ROLLUP_LOOKBACK_DAYS,
  estimateMetaConversationCostMicroEur,
  metaCostFromBillableCounts,
  metaRateForCategory,
  parseMetaRateCardOverrides,
  resolveMetaRateCard,
} from '@/lib/billing/meta';

describe('Meta rate card', () => {
  it('exposes the four Meta pricing categories', () => {
    expect(META_PRICING_CATEGORIES).toEqual([
      'utility',
      'marketing',
      'service',
      'authentication',
    ]);
  });

  it('prices each category at the confirmed / placeholder base rate (micro-EUR)', () => {
    // utility + service are task-confirmed; marketing + authentication are
    // ⚠ CONFIRM placeholders and MUST update when Meta pricing is re-checked.
    expect(BASE_META_RATE_CARD_MICRO_EUR.utility).toBe(21_000);
    expect(BASE_META_RATE_CARD_MICRO_EUR.service).toBe(0);
    expect(BASE_META_RATE_CARD_MICRO_EUR.marketing).toBe(0); // ⚠ placeholder
    expect(BASE_META_RATE_CARD_MICRO_EUR.authentication).toBe(0); // ⚠ placeholder
  });

  it('documents its unit and currency as micro-EUR', () => {
    expect(META_RATE_CARD_CURRENCY).toBe('EUR');
    expect(META_RATE_CARD_UNIT).toBe('micro-EUR per billable message');
    expect(META_ROLLUP_LOOKBACK_DAYS).toBe(3);
  });
});

describe('metaRateForCategory', () => {
  it('returns the card rate for each known category', () => {
    expect(metaRateForCategory('utility')).toBe(21_000);
    expect(metaRateForCategory('service')).toBe(0);
    expect(metaRateForCategory('marketing')).toBe(0);
    expect(metaRateForCategory('authentication')).toBe(0);
  });

  it('normalizes case and surrounding whitespace', () => {
    expect(metaRateForCategory('UTILITY')).toBe(21_000);
    expect(metaRateForCategory('  Utility  ')).toBe(21_000);
    expect(metaRateForCategory('SeRvIcE')).toBe(0);
  });

  it('falls back to the utility rate for unknown / blank categories (never €0)', () => {
    expect(META_RATE_CARD_UNKNOWN_CATEGORY_MICRO_EUR).toBe(21_000);
    expect(metaRateForCategory('referral_conversion')).toBe(21_000);
    expect(metaRateForCategory('')).toBe(21_000);
    expect(metaRateForCategory(null)).toBe(21_000);
    expect(metaRateForCategory(undefined)).toBe(21_000);
  });
});

describe('metaCostFromBillableCounts', () => {
  it('sums per-category cost, total billable messages, and flags no unknowns', () => {
    const result = metaCostFromBillableCounts({ utility: 3, service: 2 });
    expect(result.microEur).toBe(3 * 21_000 + 2 * 0);
    expect(result.billableMessages).toBe(5);
    expect(result.unknownCategories).toEqual([]);
  });

  it('accepts a Map and normalizes category keys', () => {
    const result = metaCostFromBillableCounts(
      new Map([
        ['UTILITY', 2],
        [' utility ', 1],
      ]),
    );
    expect(result.microEur).toBe(3 * 21_000);
    expect(result.billableMessages).toBe(3);
    expect(result.unknownCategories).toEqual([]);
  });

  it('prices unknown categories at the fallback rate and reports them', () => {
    const result = metaCostFromBillableCounts({ utility: 1, mystery: 2 });
    expect(result.microEur).toBe(1 * 21_000 + 2 * 21_000);
    expect(result.billableMessages).toBe(3);
    expect(result.unknownCategories).toEqual(['mystery']);
  });

  it('treats a blank category as an unknown priced at the fallback', () => {
    const result = metaCostFromBillableCounts({ '': 4 });
    expect(result.microEur).toBe(4 * 21_000);
    expect(result.billableMessages).toBe(4);
    expect(result.unknownCategories).toEqual(['']);
  });

  it('ignores non-positive / non-finite counts', () => {
    const result = metaCostFromBillableCounts({
      utility: 0,
      service: -3,
      marketing: Number.NaN,
    });
    expect(result.microEur).toBe(0);
    expect(result.billableMessages).toBe(0);
    expect(result.unknownCategories).toEqual([]);
  });
});

describe('parseMetaRateCardOverrides / resolveMetaRateCard', () => {
  it('returns no overrides for empty / undefined input', () => {
    expect(parseMetaRateCardOverrides(undefined)).toEqual({});
    expect(parseMetaRateCardOverrides('')).toEqual({});
    expect(parseMetaRateCardOverrides('   ')).toEqual({});
  });

  it('parses a valid partial override', () => {
    expect(parseMetaRateCardOverrides('{"marketing":30000}')).toEqual({
      marketing: 30_000,
    });
  });

  it('overlays overrides onto the base card, leaving other rates untouched', () => {
    const card = resolveMetaRateCard('{"marketing":30000,"authentication":15000}');
    expect(card).toEqual({
      utility: 21_000,
      marketing: 30_000,
      service: 0,
      authentication: 15_000,
    });
  });

  it('throws on non-JSON input', () => {
    expect(() => parseMetaRateCardOverrides('not json')).toThrow(
      /not valid JSON/,
    );
  });

  it('throws on a schema-invalid override (negative / non-integer / unknown key)', () => {
    expect(() => parseMetaRateCardOverrides('{"utility":-1}')).toThrow();
    expect(() => parseMetaRateCardOverrides('{"utility":1.5}')).toThrow();
    expect(() => parseMetaRateCardOverrides('{"utility":"cheap"}')).toThrow();
  });

  it('resolves the live rate card from the base with no env override', () => {
    // The process-level card was resolved with no override in the test env.
    expect(META_RATE_CARD_MICRO_EUR).toEqual({
      utility: 21_000,
      marketing: 0,
      service: 0,
      authentication: 0,
    });
  });
});

describe('estimateMetaConversationCostMicroEur (fallback only)', () => {
  it('is zero for zero conversations', () => {
    expect(estimateMetaConversationCostMicroEur(0)).toBe(0);
  });

  it('multiplies by the default per-conversation rate', () => {
    expect(estimateMetaConversationCostMicroEur(3)).toBe(180_000);
    expect(DEFAULT_META_CONVERSATION_COST_MICRO_EUR).toBe(60_000);
  });

  it('honours a custom rate', () => {
    expect(estimateMetaConversationCostMicroEur(2, 50_000)).toBe(100_000);
  });

  it('rounds a fractional count before multiplying', () => {
    expect(estimateMetaConversationCostMicroEur(2.6)).toBe(3 * 60_000);
  });

  it('clamps negative and non-finite counts to zero', () => {
    expect(estimateMetaConversationCostMicroEur(-4)).toBe(0);
    expect(estimateMetaConversationCostMicroEur(Number.NaN)).toBe(0);
    expect(estimateMetaConversationCostMicroEur(Number.POSITIVE_INFINITY)).toBe(
      0,
    );
  });
});
