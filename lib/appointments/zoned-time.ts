import { tzOffset } from '@date-fns/tz';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export type WallTime = {
  year: number;
  /** 1–12 */
  month: number;
  day: number;
  hours: number;
  minutes: number;
  seconds?: number;
};

/**
 * The instant a wall time in `timeZone` maps to, independent of the host's
 * own time zone. `new TZDate(y, m, d, h, …, tz)` resolves a wall time that
 * doesn't exist or exists twice through the host's `Date`, so the same call
 * gives a different instant on a UTC server than on a Europe/Tirane laptop.
 *
 * Out-of-range fields roll over (`hours: 24` is the next day's midnight).
 * Edge cases follow Temporal's "compatible" disambiguation:
 * - spring-forward gap: moves forward by the skipped amount (Europe/Tirane
 *   02:30 on the last Sunday of March is 03:30 CEST), `exact: false`;
 * - fall-back repeat: the earlier of the two occurrences, `exact: true`.
 */
export function zonedWallTime(
  wall: WallTime,
  timeZone: string,
): { instant: Date; exact: boolean } {
  const guess = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hours,
    wall.minutes,
    wall.seconds ?? 0,
  );
  // Transitions are months apart, so a day either side brackets the offsets
  // in force around this wall time.
  const before = tzOffset(timeZone, new Date(guess - DAY_MS));
  const after = tzOffset(timeZone, new Date(guess + DAY_MS));

  const matches = [before, after]
    .map((offset) => ({ offset, instant: guess - offset * MINUTE_MS }))
    .filter(
      ({ offset, instant }) => tzOffset(timeZone, new Date(instant)) === offset,
    )
    .map(({ instant }) => instant);

  if (matches.length > 0) {
    return { instant: new Date(Math.min(...matches)), exact: true };
  }
  // In the gap: read the wall time with the offset from before the jump,
  // which lands the same distance past the transition.
  return { instant: new Date(guess - before * MINUTE_MS), exact: false };
}
