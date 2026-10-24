import { describe, expect, it } from 'vitest';
import {
  defaultDraft,
  draftFromRules,
  draftToRules,
  hoursDiffer,
  normalizeAvailabilityDraft,
  setDayHours,
  setSharedHours,
  timezoneLabel,
  toggleDay,
} from '../availability';

const TZ = 'Europe/Tirane';
const open = (d: ReturnType<typeof defaultDraft>) =>
  d.days.flatMap((day, w) => (day.open ? [w] : []));

describe('defaultDraft', () => {
  it('opens Monday to Friday 09-17 and keeps the hours on Sat/Sun', () => {
    const d = defaultDraft(TZ);
    expect(open(d)).toEqual([1, 2, 3, 4, 5]);
    expect(d.days[6]).toEqual({ open: false, start: '09:00', end: '17:00' });
    expect(d.hours).toEqual({ start: '09:00', end: '17:00' });
    expect(d.timezone).toBe(TZ);
  });
});

describe('draftFromRules', () => {
  it('no rules gives the default', () => {
    expect(draftFromRules([], TZ)).toEqual(defaultDraft(TZ));
  });
  it('opens only the saved days; hours = first open day in Monday-first order', () => {
    const d = draftFromRules(
      [
        { weekday: 5, start: '09:00', end: '14:00' },
        { weekday: 3, start: '12:00', end: '20:00' },
      ],
      TZ,
    );
    expect(open(d)).toEqual([3, 5]);
    expect(d.hours).toEqual({ start: '12:00', end: '20:00' });
    expect(d.days[0].open).toBe(false);
  });
  it('keeps the earliest of two ranges on a day', () => {
    const d = draftFromRules(
      [
        { weekday: 1, start: '14:00', end: '18:00' },
        { weekday: 1, start: '09:00', end: '12:00' },
      ],
      TZ,
    );
    expect(d.days[1]).toEqual({ open: true, start: '09:00', end: '12:00' });
  });
  it('round trips the open days and hours', () => {
    const rules = [
      { weekday: 1, start: '09:00', end: '17:00' },
      { weekday: 3, start: '12:00', end: '20:00' },
      { weekday: 0, start: '10:00', end: '13:00' },
    ];
    expect(draftToRules(draftFromRules(rules, TZ))).toEqual(rules);
  });
});

describe('transitions', () => {
  it('toggleDay: closed opens with the template, open closes', () => {
    let d = setSharedHours(defaultDraft(TZ), { end: '18:00' });
    d = toggleDay(d, 6);
    expect(d.days[6]).toEqual({ open: true, start: '09:00', end: '18:00' });
    d = toggleDay(d, 6);
    expect(d.days[6].open).toBe(false);
  });
  it('setSharedHours patches only that field on open days', () => {
    let d = setDayHours(defaultDraft(TZ), 2, { start: '10:00' });
    d = setSharedHours(d, { end: '18:00' });
    expect(d.days[2]).toEqual({ open: true, start: '10:00', end: '18:00' });
    expect(d.days[1]).toEqual({ open: true, start: '09:00', end: '18:00' });
    expect(d.days[6]).toEqual({ open: false, start: '09:00', end: '17:00' });
    expect(d.hours).toEqual({ start: '09:00', end: '18:00' });
  });
  it('setDayHours affects one day only', () => {
    const d = setDayHours(defaultDraft(TZ), 3, {
      start: '12:00',
      end: '20:00',
    });
    expect(d.days[3]).toEqual({ open: true, start: '12:00', end: '20:00' });
    expect(d.days[2].start).toBe('09:00');
    expect(d.hours).toEqual({ start: '09:00', end: '17:00' });
  });
  it('hoursDiffer', () => {
    const d = defaultDraft(TZ);
    expect(hoursDiffer(d)).toBe(false);
    expect(hoursDiffer(setDayHours(d, 3, { end: '20:00' }))).toBe(true);
    expect(hoursDiffer(setDayHours(d, 6, { end: '20:00' }))).toBe(false);
  });
  it('draftToRules is Monday-first and skips closed days', () => {
    const d = toggleDay(defaultDraft(TZ), 0);
    expect(draftToRules(d).map((r) => r.weekday)).toEqual([1, 2, 3, 4, 5, 0]);
  });
});

describe('normalizeAvailabilityDraft', () => {
  const initial = defaultDraft(TZ);
  it('falls back to initial for non-objects', () => {
    expect(normalizeAvailabilityDraft('x', initial)).toBe(initial);
    expect(normalizeAvailabilityDraft(null, initial)).toBe(initial);
  });
  it('falls back per field', () => {
    const out = normalizeAvailabilityDraft(
      { timezone: 5, hours: { start: 1 }, days: [{ open: true }] },
      initial,
    );
    expect(out).toEqual(initial);
  });
  it('keeps valid stored parts', () => {
    const stored = toggleDay(defaultDraft('Europe/Rome'), 6);
    expect(normalizeAvailabilityDraft(stored, initial)).toEqual(stored);
  });
});

describe('timezoneLabel', () => {
  it('Tiranë for the default, last segment otherwise', () => {
    expect(timezoneLabel('Europe/Tirane')).toBe('Tiranë');
    expect(timezoneLabel('America/New_York')).toBe('New York');
    expect(timezoneLabel('UTC')).toBe('UTC');
  });
});
