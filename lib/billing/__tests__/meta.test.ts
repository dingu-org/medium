import { describe, expect, it } from 'vitest';
import {
  DEFAULT_META_CONVERSATION_COST_MICRO_EUR,
  estimateMetaConversationCostMicroEur,
} from '@/lib/billing/meta';

describe('estimateMetaConversationCostMicroEur', () => {
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
