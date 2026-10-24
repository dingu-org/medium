import type { WeeklyRule } from '@/lib/availability/rules';
import { t } from '@/lib/i18n';
import { DEFAULT_TIMEZONE } from '@/lib/i18n/timezone';

/** Monday-first display order; values are JS getDay() (0 = Sunday). */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const DEFAULT_HOURS = { start: '09:00', end: '17:00' };
export const DEFAULT_OPEN_DAYS = [1, 2, 3, 4, 5];

export type DayDraft = { open: boolean; start: string; end: string };
export type AvailabilityDraft = {
  timezone: string;
  /** The shared Fillon/Mbaron pair; the template for opened days. */
  hours: { start: string; end: string };
  /** Length 7, index = weekday (0 = Sunday). */
  days: DayDraft[];
};

// These functions never validate: see `validateWeekly` in lib/availability/rules.

export function defaultDraft(timezone: string): AvailabilityDraft {
  return {
    timezone,
    hours: { ...DEFAULT_HOURS },
    days: Array.from({ length: 7 }, (_, w) => ({
      open: DEFAULT_OPEN_DAYS.includes(w),
      ...DEFAULT_HOURS,
    })),
  };
}

/**
 * Saved rules to a draft. One range per day: the earliest wins (same as the
 * Settings page). No rules means the default suggestion.
 */
export function draftFromRules(
  rules: WeeklyRule[],
  timezone: string,
): AvailabilityDraft {
  if (rules.length === 0) return defaultDraft(timezone);
  const earliest = new Map<number, WeeklyRule>();
  for (const r of rules) {
    const current = earliest.get(r.weekday);
    if (!current || r.start < current.start) earliest.set(r.weekday, r);
  }
  const days: DayDraft[] = Array.from({ length: 7 }, (_, w) => {
    const r = earliest.get(w);
    return r
      ? { open: true, start: r.start, end: r.end }
      : { open: false, ...DEFAULT_HOURS };
  });
  const first = DAY_ORDER.find((w) => days[w].open);
  const hours =
    first === undefined
      ? { ...DEFAULT_HOURS }
      : { start: days[first].start, end: days[first].end };
  return { timezone, hours, days };
}

/** Open to closed keeps the hours in state; closed to open takes the template. */
export function toggleDay(
  d: AvailabilityDraft,
  weekday: number,
): AvailabilityDraft {
  return {
    ...d,
    days: d.days.map((day, w) =>
      w !== weekday
        ? day
        : day.open
          ? { ...day, open: false }
          : { open: true, start: d.hours.start, end: d.hours.end },
    ),
  };
}

/** Updates the template and ONLY the patched field on every open day. */
export function setSharedHours(
  d: AvailabilityDraft,
  patch: Partial<{ start: string; end: string }>,
): AvailabilityDraft {
  return {
    ...d,
    hours: { ...d.hours, ...patch },
    days: d.days.map((day) => (day.open ? { ...day, ...patch } : day)),
  };
}

/** One day only; the template is untouched. */
export function setDayHours(
  d: AvailabilityDraft,
  weekday: number,
  patch: Partial<{ start: string; end: string }>,
): AvailabilityDraft {
  return {
    ...d,
    days: d.days.map((day, w) => (w === weekday ? { ...day, ...patch } : day)),
  };
}

/** True when the open days do not all share the same start and end. */
export function hoursDiffer(d: AvailabilityDraft): boolean {
  const open = d.days.filter((day) => day.open);
  return open.some(
    (day) => day.start !== open[0].start || day.end !== open[0].end,
  );
}

export function draftToRules(d: AvailabilityDraft): WeeklyRule[] {
  return DAY_ORDER.filter((w) => d.days[w].open).map((w) => ({
    weekday: w,
    start: d.days[w].start,
    end: d.days[w].end,
  }));
}

const isHours = (v: unknown): v is { start: string; end: string } =>
  !!v &&
  typeof v === 'object' &&
  typeof (v as Record<string, unknown>).start === 'string' &&
  typeof (v as Record<string, unknown>).end === 'string';

const isDay = (v: unknown): v is DayDraft =>
  isHours(v) && typeof (v as Record<string, unknown>).open === 'boolean';

/** A stored draft may be old or malformed: each part falls back to `initial`. */
export function normalizeAvailabilityDraft(
  stored: unknown,
  initial: AvailabilityDraft,
): AvailabilityDraft {
  if (!stored || typeof stored !== 'object') return initial;
  const s = stored as Record<string, unknown>;
  return {
    timezone:
      typeof s.timezone === 'string' && s.timezone
        ? s.timezone
        : initial.timezone,
    hours: isHours(s.hours)
      ? { start: s.hours.start, end: s.hours.end }
      : initial.hours,
    days:
      Array.isArray(s.days) && s.days.length === 7 && s.days.every(isDay)
        ? s.days.map((day) => ({
            open: day.open,
            start: day.start,
            end: day.end,
          }))
        : initial.days,
  };
}

/** "Tiranë" for the default zone, otherwise the last IANA segment ("New York"). */
export function timezoneLabel(tz: string): string {
  if (tz === DEFAULT_TIMEZONE) return t.onboarding.availability.tirana;
  const last = tz.split('/').pop() ?? tz;
  return last.replace(/_/g, ' ');
}
