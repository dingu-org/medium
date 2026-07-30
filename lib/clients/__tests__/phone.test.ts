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
    // A single leading '0' is the national trunk prefix — the way Albanian
    // numbers are written down. It becomes the country code, otherwise '+069…'
    // would never match the wa_id '355692345678'.
    ['0692345678', '+355692345678'],
    ['069 234 5678', '+355692345678'],
    ['069-234-5678', '+355692345678'],
    ['042345678', '+35542345678'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeManualPhone(input)).toBe(expected);
  });

  it.each([
    '1234567',
    '+1234567890123456',
    'not-a-phone',
    // An explicit '+' means the caller typed a country code, and no E.164
    // country code starts with '0' — don't guess, reject.
    '+0692345678',
    // Too short to be a trunk-prefixed local number either.
    '069234',
  ])(
    'rejects %s',
    (input) => expect(normalizeManualPhone(input)).toBeNull(),
  );
});
