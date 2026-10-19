import { afterEach, describe, expect, it } from 'vitest';
import { zonedWallTime, type WallTime } from '../zoned-time';

const ZONE = 'Europe/Tirane';
const originalTz = process.env.TZ;

function resolve(wall: WallTime) {
  const { instant, exact } = zonedWallTime(wall, ZONE);
  return { iso: instant.toISOString(), exact };
}

// The bug this guards against: `new TZDate(y, m, d, h, …, tz)` resolved gap and
// repeated wall times through the host's zone, so CI (UTC) and a Tirane laptop
// disagreed. Every case runs under several host zones and must not move.
describe.each(['UTC', 'Europe/Tirane', 'America/New_York', 'Asia/Tokyo'])(
  'zonedWallTime on a %s host',
  (hostTz) => {
    afterEach(() => {
      if (originalTz === undefined) delete process.env.TZ;
      else process.env.TZ = originalTz;
    });

    function onHost<T>(fn: () => T): T {
      process.env.TZ = hostTz;
      return fn();
    }

    it('maps an ordinary wall time', () => {
      expect(
        onHost(() =>
          resolve({ year: 2026, month: 6, day: 1, hours: 10, minutes: 0 }),
        ),
      ).toEqual({ iso: '2026-06-01T08:00:00.000Z', exact: true });
    });

    it('moves a spring-forward gap time forward by the skipped hour', () => {
      expect(
        onHost(() =>
          resolve({ year: 2026, month: 3, day: 29, hours: 2, minutes: 0 }),
        ),
      ).toEqual({ iso: '2026-03-29T01:00:00.000Z', exact: false }); // 03:00 CEST
      expect(
        onHost(() =>
          resolve({ year: 2026, month: 3, day: 29, hours: 2, minutes: 30 }),
        ),
      ).toEqual({ iso: '2026-03-29T01:30:00.000Z', exact: false }); // 03:30 CEST
    });

    it('takes the first occurrence of a repeated fall-back time', () => {
      expect(
        onHost(() =>
          resolve({ year: 2026, month: 10, day: 25, hours: 2, minutes: 30 }),
        ),
      ).toEqual({ iso: '2026-10-25T00:30:00.000Z', exact: true }); // 02:30 CEST
    });

    it('rolls 24:00 over to the next midnight', () => {
      expect(
        onHost(() =>
          resolve({ year: 2026, month: 6, day: 1, hours: 24, minutes: 0 }),
        ),
      ).toEqual({ iso: '2026-06-01T22:00:00.000Z', exact: true });
    });
  },
);
