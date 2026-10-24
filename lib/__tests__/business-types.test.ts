import { describe, expect, it } from 'vitest';
import {
  BUSINESS_TYPES,
  businessTypeSchema,
  isBusinessType,
} from '../business-types';
import { t } from '../i18n';

describe('business types', () => {
  it('is exactly the eleven documented types, in display order', () => {
    expect([...BUSINESS_TYPES]).toEqual([
      'psychologist',
      'physiotherapist',
      'dentist',
      'beauty_salon',
      'personal_trainer',
      'barber_hairdresser',
      'massage_therapist',
      'nutritionist',
      'coach_tutor',
      'consultant',
      'other_professional',
    ]);
  });

  it('accepts only listed ids', () => {
    for (const type of BUSINESS_TYPES) {
      expect(isBusinessType(type)).toBe(true);
      expect(businessTypeSchema.safeParse(type).success).toBe(true);
    }
    for (const value of ['Barber', '', null, undefined, 'other', 42]) {
      expect(isBusinessType(value)).toBe(false);
      expect(businessTypeSchema.safeParse(value).success).toBe(false);
    }
  });

  it('labels every type and nothing else', () => {
    expect(Object.keys(t.businessTypes).sort()).toEqual(
      [...BUSINESS_TYPES].sort(),
    );
  });
});
