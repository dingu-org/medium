import { describe, expect, it } from 'vitest';
import { CLIENT_ADDRESS_MAX, clientAddressField } from '../client-address';

describe('clientAddressField', () => {
  it('flattens control characters and newlines to one line', () => {
    const parsed = clientAddressField.parse('Rruga e Kavajës 5\n\nTiranë\t ');
    expect(parsed).toBe('Rruga e Kavajës 5 Tiranë');
  });

  it('rejects an address that is too short or empty after sanitising', () => {
    expect(clientAddressField.safeParse('ab').success).toBe(false);
    expect(clientAddressField.safeParse(' \n\t ').success).toBe(false);
  });

  it('rejects non-strings and values over the cap', () => {
    expect(clientAddressField.safeParse(undefined).success).toBe(false);
    expect(clientAddressField.safeParse(42).success).toBe(false);
    expect(
      clientAddressField.safeParse('a'.repeat(CLIENT_ADDRESS_MAX + 1)).success,
    ).toBe(false);
    expect(
      clientAddressField.safeParse('a'.repeat(CLIENT_ADDRESS_MAX)).success,
    ).toBe(true);
  });
});
