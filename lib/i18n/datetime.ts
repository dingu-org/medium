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
  return FULL_WEEKDAYS[date.getDay()];
}

const FULL_WEEKDAYS = [
  'E diel',
  'E hënë',
  'E martë',
  'E mërkurë',
  'E enjte',
  'E premte',
  'E shtunë',
] as const;

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
  return format(date, 'd MMMM', { locale: sq }).toLocaleLowerCase('sq');
}

/** Day + full month + year: `6 maj 2026`. */
export function formatDateLong(date: Date): string {
  return format(date, 'd MMMM yyyy', { locale: sq }).toLocaleLowerCase('sq');
}

/** Weekday + date: `E hënë, 6 maj`. */
export function formatWeekdayDate(date: Date): string {
  return `${formatWeekday(date)}, ${formatDate(date)}`;
}

/** Month + year header, sentence-cased: `Maj 2026`. */
export function formatMonthYear(date: Date): string {
  const s = format(date, 'LLLL yyyy', { locale: sq }).toLocaleLowerCase('sq');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Compact relative timestamp for list rows, per the design's chat list:
 * `tani`, `8 min`, `3 orë`, `dje`, `4 ditë`, then a `6 maj` date.
 */
export function formatRelativeShort(date: Date, now = new Date()): string {
  const mins = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (mins < 1) return 'tani';
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24 && date.getDate() === now.getDate())
    return hours === 1 ? '1 orë' : `${hours} orë`;
  const days = Math.floor(hours / 24);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'dje';
  if (days < 7) return `${Math.max(days, 1)} ditë`;
  return formatDate(date);
}

/** Day-separator label for chat threads: `sot`, `dje`, else `6 maj`. */
export function formatDayLabel(date: Date, now = new Date()): string {
  if (date.toDateString() === now.toDateString()) return 'sot';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'dje';
  return formatDate(date);
}
