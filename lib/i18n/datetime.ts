import { format } from 'date-fns';
import { sq } from 'date-fns/locale';

/**
 * Albanian date/time formatting helpers, following the design conventions:
 * 24h time (`14:30`), sentence-case weekdays (`E hënë`), abbreviated weekdays
 * (`E hën.`), and `6 maj` style dates with tabular numerals.
 *
 * Callers pass a Date already in the practice timezone (e.g. a `TZDate`); these
 * helpers only format — they do not re-zone.
 */

/** 24h time, e.g. `14:30`. */
export function formatTime(date: Date): string {
  return format(date, 'HH:mm');
}

/** Full Albanian weekday, sentence-cased: `E hënë`. */
export function formatWeekday(date: Date): string {
  const s = format(date, 'EEEE', { locale: sq });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// date-fns' `sq` abbreviations don't match the design's `E hën.` form, so map by
// weekday index (0 = Sunday) for the compact week strip.
const SHORT_WEEKDAYS = [
  'E die.',
  'E hën.',
  'E mar.',
  'E mër.',
  'E enj.',
  'E pre.',
  'E sht.',
] as const;

/** Abbreviated Albanian weekday: `E mar.`. */
export function formatWeekdayShort(date: Date): string {
  return SHORT_WEEKDAYS[date.getDay()];
}

/** Day + full month: `6 maj`. */
export function formatDate(date: Date): string {
  return format(date, 'd MMMM', { locale: sq });
}

/** Day + full month + year: `6 maj 2026`. */
export function formatDateLong(date: Date): string {
  return format(date, 'd MMMM yyyy', { locale: sq });
}

/** Weekday + date: `E hënë, 6 maj`. */
export function formatWeekdayDate(date: Date): string {
  return `${formatWeekday(date)}, ${formatDate(date)}`;
}

/** Month + year header, sentence-cased: `Maj 2026`. */
export function formatMonthYear(date: Date): string {
  const s = format(date, 'LLLL yyyy', { locale: sq });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
