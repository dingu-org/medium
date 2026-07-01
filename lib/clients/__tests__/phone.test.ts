import { describe, expect, it } from 'vitest';
import { normalizeManualPhone } from '../phone';

describe('normalizeManualPhone', () => {
  it.each([
    ['+355 69 123 4567', '+355691234567'],
    // '00' international prefix is normalized away so the stored number matches
    // the digits-only WhatsApp wa_id ('4915123456789').
    ['(0049) 151-23456789', '+4915123456789'],
    ['00355691234567', '+355691234567'],
    ['355691234567', '+355691234567'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeManualPhone(input)).toBe(expected);
  });

  it.each(['1234567', '+1234567890123456', 'not-a-phone'])(
    'rejects %s',
    (input) => expect(normalizeManualPhone(input)).toBeNull(),
  );
});
