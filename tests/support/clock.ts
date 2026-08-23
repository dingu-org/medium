import { TZDate } from '@date-fns/tz';
import { afterAll, beforeAll, vi } from 'vitest';

export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/**
 * Every PT fixture in this repo is seeded in Europe/Tirane, and
 * `formatAppointmentTime` renders in the PT's zone, so the test clock has to be
 * anchored in that zone too — anchoring in the machine's zone would make the
 * rendered strings depend on where the suite runs.
 */
export const TEST_TIMEZONE = 'Europe/Tirane';

export type TestNowOptions = {
  timezone?: string;
  /** 0 = Sunday … 6 = Saturday. Snaps the anchor forward to that weekday. */
  weekday?: number;
  /** Pin to this day of the current month instead of today's date. */
  dayOfMonth?: number;
  /** Local hour in `timezone`. Defaults to 10 — never midnight, never a DST jump. */
  hour?: number;
  /** Local minute in `timezone`. */
  minute?: number;
};

/**
 * A deterministic "now" that is *derived* rather than written down.
 *
 * No test in this repo may carry an absolute date literal: a literal is only
 * correct until the wall clock passes it, and this suite has already rotted
 * twice that way (2026-08-01 detonated silently and stayed red for twelve days).
 * But a bare `new Date()` offset is not the answer either — several assertions
 * compare against `formatAppointmentTime`, so a run that crosses midnight or a
 * DST switch between fixture and assertion would render two different strings.
 *
 * So: derive one instant from the real clock, normalise it to a safe position,
 * freeze it, and hang every fixture off it. The anchor moves with the calendar;
 * the test outcome does not.
 *
 * Normalisation rules, all deliberate:
 * - 10:30 local, so nothing sits on a midnight boundary and no fixture a few
 *   hours either side of "now" lands on a different local day;
 * - Europe/Tirane switches DST at 02:00/03:00 local on the last Sunday of March
 *   and October, so a 10:30 anchor is never inside a transition and never
 *   ambiguous;
 * - `weekday` snaps forward when availability logic reads the day of week;
 * - `dayOfMonth` pins the anchor away from month edges when the assertion counts
 *   "this month".
 */
export function testNow(options: TestNowOptions = {}): Date {
  const {
    timezone = TEST_TIMEZONE,
    hour = 10,
    minute = 30,
    weekday,
    dayOfMonth,
  } = options;

  const today = new TZDate(Date.now(), timezone);
  const at = (year: number, month: number, day: number) =>
    new TZDate(year, month, day, hour, minute, 0, 0, timezone);

  let anchor = at(
    today.getFullYear(),
    today.getMonth(),
    dayOfMonth ?? today.getDate(),
  );
  if (weekday !== undefined) {
    // Rebuild from calendar parts rather than adding milliseconds: crossing a
    // DST switch by arithmetic would move the local time off 10:30.
    const shift = (weekday - anchor.getDay() + 7) % 7;
    anchor = at(
      anchor.getFullYear(),
      anchor.getMonth(),
      anchor.getDate() + shift,
    );
  }
  return new Date(anchor.getTime());
}

/**
 * The instant of a local wall time on the calendar day of `day`.
 *
 * Availability rules are stored as local `HH:MM` per weekday, so fixtures have
 * to be built the same way. Writing `hour - 2` instead — as several of these
 * tests used to — silently assumes the anchor is in summer time; the same
 * fixture in November would be an hour off.
 */
export function zonedTime(
  day: Date,
  hour: number,
  minute = 0,
  timezone = TEST_TIMEZONE,
): Date {
  const zoned = new TZDate(day.getTime(), timezone);
  return new Date(
    new TZDate(
      zoned.getFullYear(),
      zoned.getMonth(),
      zoned.getDate(),
      hour,
      minute,
      0,
      0,
      timezone,
    ).getTime(),
  );
}

/**
 * The UTC-calendar sibling of `testNow`, for suites that seed the PT in UTC and
 * reason in UTC days and months. Noon keeps every ±12h fixture on the same UTC
 * day, and UTC has no DST to fall into.
 */
export function testNowUtc(
  options: { dayOfMonth?: number; hour?: number } = {},
): Date {
  const today = new Date();
  const { dayOfMonth = today.getUTCDate(), hour = 12 } = options;
  return new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), dayOfMonth, hour),
  );
}

/**
 * Freeze `Date` at a derived instant for the whole file and restore real timers
 * afterwards, so no frozen clock leaks into the next file.
 *
 * Only `Date` is faked. Faking `setTimeout`/`setInterval` as well would deadlock
 * every integration file here: postgres-js, undici and the Supabase client all
 * arm real timers around real I/O, and nothing in this suite advances them.
 * Files that genuinely need to drive timers can pass extra `toFake` entries.
 */
export function freezeClockForFile(
  options: TestNowOptions & { toFake?: string[] } = {},
): Date {
  const { toFake = [], ...nowOptions } = options;
  const now = testNow(nowOptions);
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date', ...toFake] as never });
    vi.setSystemTime(now);
  });
  afterAll(() => {
    vi.useRealTimers();
  });
  return now;
}
