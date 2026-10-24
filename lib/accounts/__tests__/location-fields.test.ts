import { z } from 'zod';
import { describe, expect, it } from 'vitest';
import { t } from '@/lib/i18n';
import {
  cityField,
  floorField,
  parkingField,
  serviceAreaField,
  streetAddressField,
} from '../location-fields';

const w = t.onboarding.where;

function message(schema: z.ZodType, value: unknown) {
  const r = schema.safeParse(value);
  return r.success ? null : r.error.issues[0].message;
}

describe('required location fields', () => {
  it.each([
    [cityField, w.cityRequired],
    [streetAddressField, w.addressRequired],
    [serviceAreaField, w.serviceAreaRequired],
  ])('reject empty, blank and missing with their own message', (f, msg) => {
    expect(message(f, '')).toBe(msg);
    expect(message(f, '   ')).toBe(msg);
    expect(message(f, undefined)).toBe(msg);
  });
  it('sanitises to one line', () => {
    const r = streetAddressField.safeParse('Rr. A\n- x');
    expect(r.success && r.data).not.toContain('\n');
  });
  it('rejects over the cap with tooLong', () => {
    expect(message(cityField, 'a'.repeat(121))).toBe(w.tooLong);
    expect(cityField.safeParse('a'.repeat(120)).success).toBe(true);
    expect(message(streetAddressField, 'a'.repeat(241))).toBe(w.tooLong);
  });
});

describe('optional location fields', () => {
  it('maps empty to undefined and enforces the cap', () => {
    const empty = parkingField.safeParse('');
    expect(empty.success && empty.data).toBeUndefined();
    expect(parkingField.safeParse('a'.repeat(200)).success).toBe(true);
    expect(message(parkingField, 'a'.repeat(201))).toBe(w.tooLong);
    expect(floorField.safeParse('a'.repeat(40)).success).toBe(true);
    expect(message(floorField, 'a'.repeat(41))).toBe(w.tooLong);
  });
});
