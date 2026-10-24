import { describe, expect, it } from 'vitest';
import {
  parseLek,
  serviceDescriptionField,
  serviceDurationField,
  serviceModeField,
  servicePriceField,
} from '../fields';
import { SERVICE_MODES, isServiceMode } from '../modes';

describe('parseLek', () => {
  it.each(['2500', '2 500', '2.500', '2,500', '2 500', ' 2500 '])(
    'reads %j as 2500',
    (raw) => {
      expect(parseLek(raw)).toBe(2500);
    },
  );

  it('reads zero as 0 (the price field rejects it)', () => {
    expect(parseLek('0')).toBe(0);
    expect(servicePriceField.safeParse(0).success).toBe(false);
  });

  it.each(['', '12.5', '-5', '1e3', 'abc', '2.50', '+5', '1.5000'])(
    'rejects %j',
    (raw) => {
      expect(parseLek(raw)).toBeNull();
    },
  );
});

describe('service fields', () => {
  it('collapses line breaks in the description and keeps it prompt-safe', () => {
    const parsed = serviceDescriptionField.parse('Manikyr\n\nme   xhel');
    expect(parsed).not.toMatch(/[\r\n]/);
    expect(parsed).toContain('Manikyr');
  });

  it('rejects a blank or over-long description', () => {
    expect(serviceDescriptionField.safeParse('  \n ').success).toBe(false);
    expect(serviceDescriptionField.safeParse('a'.repeat(500)).success).toBe(true);
    expect(serviceDescriptionField.safeParse('a'.repeat(501)).success).toBe(false);
  });

  it('keeps the duration range 5 to 480 in whole minutes', () => {
    for (const bad of [4, 481, 30.5]) {
      expect(serviceDurationField.safeParse(bad).success).toBe(false);
    }
    for (const ok of [5, 45, 480]) {
      expect(serviceDurationField.safeParse(ok).success).toBe(true);
    }
  });

  it('accepts only the three modes', () => {
    expect(serviceModeField.safeParse('in_person').success).toBe(false);
    expect(serviceModeField.safeParse('online').success).toBe(true);
    expect([...SERVICE_MODES]).toEqual(['at_business', 'at_client', 'online']);
    expect(isServiceMode('at_client')).toBe(true);
    expect(isServiceMode('x')).toBe(false);
    expect(isServiceMode(null)).toBe(false);
  });
});
