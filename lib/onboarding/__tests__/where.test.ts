import { describe, expect, it } from 'vitest';
import {
  normalizeWhereDraft,
  whereFieldsDone,
  whereNeeds,
  type WhereDraft,
} from '../where';

const empty = { city: null, address: null, serviceArea: null };

describe('whereNeeds', () => {
  it('needs nothing without a located mode', () => {
    expect(whereNeeds([])).toEqual({ atBusiness: false, atClient: false });
    expect(whereNeeds(['online'])).toEqual({
      atBusiness: false,
      atClient: false,
    });
    expect(whereNeeds([null])).toEqual({ atBusiness: false, atClient: false });
  });
  it('needs the group of each located mode', () => {
    expect(whereNeeds(['at_business'])).toEqual({
      atBusiness: true,
      atClient: false,
    });
    expect(whereNeeds(['at_client'])).toEqual({
      atBusiness: false,
      atClient: true,
    });
    expect(whereNeeds(['at_business', 'at_client', 'online'])).toEqual({
      atBusiness: true,
      atClient: true,
    });
  });
});

describe('whereFieldsDone', () => {
  const none = { atBusiness: false, atClient: false };
  it('is vacuously done when nothing is needed', () => {
    expect(whereFieldsDone(none, empty)).toBe(true);
  });
  it('at business needs city and address, ignores the service area', () => {
    const needs = { atBusiness: true, atClient: false };
    expect(whereFieldsDone(needs, empty)).toBe(false);
    expect(whereFieldsDone(needs, { ...empty, city: 'Tiranë' })).toBe(false);
    expect(whereFieldsDone(needs, { ...empty, address: 'Rruga 1' })).toBe(
      false,
    );
    expect(
      whereFieldsDone(needs, { ...empty, city: '  ', address: 'Rruga 1' }),
    ).toBe(false);
    expect(
      whereFieldsDone(needs, { ...empty, city: 'Tiranë', address: 'Rruga 1' }),
    ).toBe(true);
  });
  it('at client needs only the service area', () => {
    const needs = { atBusiness: false, atClient: true };
    expect(whereFieldsDone(needs, empty)).toBe(false);
    expect(whereFieldsDone(needs, { ...empty, serviceArea: ' ' })).toBe(false);
    expect(whereFieldsDone(needs, { ...empty, serviceArea: 'Durrës' })).toBe(
      true,
    );
  });
  it('mixed needs all three', () => {
    const needs = { atBusiness: true, atClient: true };
    const full = { city: 'Tiranë', address: 'Rruga 1', serviceArea: 'Durrës' };
    expect(whereFieldsDone(needs, full)).toBe(true);
    expect(whereFieldsDone(needs, { ...full, serviceArea: null })).toBe(false);
    expect(whereFieldsDone(needs, { ...full, city: null })).toBe(false);
  });
});

describe('normalizeWhereDraft', () => {
  const initial: WhereDraft = {
    city: 'A',
    address: 'B',
    directions: '',
    parking: '',
    entrance: '',
    floor: '',
    serviceArea: 'C',
  };
  it('falls back to the saved values for a non-object draft', () => {
    expect(normalizeWhereDraft('Rruga 1', initial)).toEqual(initial);
    expect(normalizeWhereDraft(null, initial)).toEqual(initial);
    expect(normalizeWhereDraft(['x'], initial)).toEqual(initial);
  });
  it('merges a partial object and ignores non-string values', () => {
    expect(
      normalizeWhereDraft({ city: 'X', address: 5, parking: 'P' }, initial),
    ).toEqual({ ...initial, city: 'X', parking: 'P' });
  });
});
