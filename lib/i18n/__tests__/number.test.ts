import { describe, expect, it } from 'vitest';
import { formatLek } from '../number';

const NBSP = '\u00a0';

describe('formatLek', () => {
  it('groups thousands with a non-breaking space (design 3 000)', () => {
    expect(formatLek(500)).toBe('500');
    expect(formatLek(3000)).toBe(`3${NBSP}000`);
    expect(formatLek(3500)).toBe(`3${NBSP}500`);
    expect(formatLek(10000)).toBe(`10${NBSP}000`);
    expect(formatLek(1234567)).toBe(`1${NBSP}234${NBSP}567`);
  });
});
