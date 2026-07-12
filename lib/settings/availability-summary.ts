import { asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { availabilityRules } from '@/lib/db/schema';

/** Distinct enabled weekdays (JS getDay(): 0=Sun … 6=Sat). */
export async function getAvailabilityWeekdays(ptId: string): Promise<number[]> {
  const rows = await db
    .select({ weekday: availabilityRules.weekday })
    .from(availabilityRules)
    .where(eq(availabilityRules.ptId, ptId))
    .orderBy(asc(availabilityRules.weekday));
  return [...new Set(rows.map((r) => r.weekday))];
}

const ABBR: Record<number, string> = {
  1: 'Hën',
  2: 'Mar',
  3: 'Mër',
  4: 'Enj',
  5: 'Pre',
  6: 'Sht',
  0: 'Die',
};

/** "Hën–Pre" for a contiguous Monday-first run; comma list otherwise; '' when empty. */
export function weekdaySummary(weekdays: number[]): string {
  if (weekdays.length === 0) return '';
  const mon = (d: number) => (d + 6) % 7; // Mon=0 … Sun=6
  const idx = [...new Set(weekdays.map(mon))].sort((a, b) => a - b);
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  const dayFor = (m: number) => ABBR[(m + 1) % 7]; // back to getDay()
  if (contiguous && idx.length > 1) {
    return `${dayFor(idx[0])}–${dayFor(idx[idx.length - 1])}`;
  }
  return idx.map(dayFor).join(', ');
}
