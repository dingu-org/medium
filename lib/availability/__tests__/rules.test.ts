import { describe, expect, it } from 'vitest';
import { t } from '@/lib/i18n';
import { isValidTimezone, TIME_RE, validateWeekly } from '../rules';

const a = t.onboarding.availability;
const tz = 'Europe/Tirane';
const r = (weekday: number, start: string, end: string) => ({
  weekday,
  start,
  end,
});

function errors(rules: unknown, timezone: unknown = tz) {
  const v = validateWeekly({ timezone, rules });
  if (v.ok) throw new Error('expected failure');
  return v;
}

describe('validateWeekly', () => {
  it('accepts Monday to Friday, sorted, with the timezone kept', () => {
    const v = validateWeekly({
      timezone: 'Europe/Rome',
      rules: [5, 3, 1].map((w) => r(w, '09:00', '17:00')),
    });
    expect(v).toEqual({
      ok: true,
      timezone: 'Europe/Rome',
      rules: [1, 3, 5].map((w) => r(w, '09:00', '17:00')),
    });
  });

  it('asks for a day when none is selected', () => {
    expect(errors([]).fieldErrors).toEqual({ days: a.noDay });
  });

  it('rejects end equal to or before start', () => {
    expect(errors([r(3, '09:00', '09:00')]).fieldErrors).toEqual({
      'day-3': t.availability.endAfterStart,
    });
    expect(errors([r(3, '17:00', '09:00')]).fieldErrors).toEqual({
      'day-3': t.availability.endAfterStart,
    });
  });

  it.each(['', '24:00', '9:00'])('rejects the time %j', (bad) => {
    expect(errors([r(2, bad, '17:00')]).fieldErrors).toEqual({
      'day-2': a.timeMissing,
    });
    expect(errors([r(2, '09:00', bad)]).fieldErrors).toEqual({
      'day-2': a.timeMissing,
    });
  });

  it('detects overlap, also in unsorted input, and allows touching ranges', () => {
    expect(
      errors([r(1, '09:00', '13:00'), r(1, '12:00', '17:00')]).fieldErrors,
    ).toEqual({ 'day-1': a.overlap });
    expect(
      errors([r(1, '12:00', '17:00'), r(1, '09:00', '13:00')]).fieldErrors,
    ).toEqual({ 'day-1': a.overlap });
    expect(
      validateWeekly({
        timezone: tz,
        rules: [r(1, '09:00', '12:00'), r(1, '12:00', '17:00')],
      }).ok,
    ).toBe(true);
  });

  it('allows the same hours on different weekdays', () => {
    expect(
      validateWeekly({
        timezone: tz,
        rules: [r(1, '09:00', '13:00'), r(2, '09:00', '13:00')],
      }).ok,
    ).toBe(true);
  });

  it.each(['Mars/Phobos', '', 123])('rejects the timezone %j', (bad) => {
    expect(errors([r(1, '09:00', '17:00')], bad).fieldErrors).toEqual({
      timezone: a.timezoneInvalid,
    });
  });

  it('reports several keys at once', () => {
    expect(errors([r(1, '17:00', '09:00')], 'Mars/Phobos').fieldErrors).toEqual(
      { 'day-1': t.availability.endAfterStart, timezone: a.timezoneInvalid },
    );
  });

  it.each([
    ['non-array', 'x'],
    ['weekday 7', [r(7, '09:00', '17:00')]],
    ['weekday 1.5', [r(1.5, '09:00', '17:00')]],
    ['29 rules', Array.from({ length: 29 }, () => r(1, '09:00', '17:00'))],
    ['string items', ['x']],
  ])('flags malformed input: %s', (_name, rules) => {
    expect(errors(rules)).toMatchObject({ malformed: true, fieldErrors: {} });
  });
});

describe('shared helpers', () => {
  it('isValidTimezone', () => {
    expect(isValidTimezone('Europe/Tirane')).toBe(true);
    expect(isValidTimezone('Mars/Phobos')).toBe(false);
  });
  it('TIME_RE', () => {
    expect(TIME_RE.test('00:00')).toBe(true);
    expect(TIME_RE.test('23:59')).toBe(true);
    expect(TIME_RE.test('24:00')).toBe(false);
    expect(TIME_RE.test('09:00:00')).toBe(false);
  });
});
