import { t } from '@/lib/i18n';

/** 24-hour wall-clock time, `HH:MM`. */
export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** One weekly range; weekday is JS getDay() (0 = Sunday), times are `HH:MM`. */
export type WeeklyRule = { weekday: number; start: string; end: string };
/** Keys: 'days' | `day-${weekday}` | 'timezone'. */
export type RulesErrors = Record<string, string>;

/** Payload sanity cap: four ranges a day. */
export const MAX_RULES = 28;

export type WeeklyValidation =
  | { ok: true; timezone: string; rules: WeeklyRule[] }
  | { ok: false; fieldErrors: RulesErrors; malformed?: true };

function isRule(value: unknown): value is WeeklyRule {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.weekday === 'number' &&
    Number.isInteger(r.weekday) &&
    r.weekday >= 0 &&
    r.weekday <= 6 &&
    typeof r.start === 'string' &&
    typeof r.end === 'string'
  );
}

/**
 * Validates a weekly schedule plus timezone. Pure: runs on the client before
 * saving and again on the server. The first error per key wins.
 */
export function validateWeekly(input: {
  timezone: unknown;
  rules: unknown;
}): WeeklyValidation {
  const { rules } = input;
  if (
    !Array.isArray(rules) ||
    rules.length > MAX_RULES ||
    !rules.every(isRule)
  ) {
    return { ok: false, fieldErrors: {}, malformed: true };
  }
  const a = t.onboarding.availability;
  const fieldErrors: RulesErrors = {};
  const setError = (key: string, message: string) => {
    if (!(key in fieldErrors)) fieldErrors[key] = message;
  };

  if (rules.length === 0) setError('days', a.noDay);

  for (const r of rules) {
    const key = `day-${r.weekday}`;
    if (!TIME_RE.test(r.start) || !TIME_RE.test(r.end)) {
      setError(key, a.timeMissing);
    } else if (r.end <= r.start) {
      setError(key, t.availability.endAfterStart);
    }
  }

  // Overlap per weekday, over the ranges that are individually valid.
  const sorted = rules
    .filter(
      (r) => TIME_RE.test(r.start) && TIME_RE.test(r.end) && r.end > r.start,
    )
    .sort((x, y) => x.weekday - y.weekday || x.start.localeCompare(y.start));
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const next = sorted[i];
    if (prev.weekday === next.weekday && next.start < prev.end) {
      setError(`day-${next.weekday}`, a.overlap);
    }
  }

  const timezone = input.timezone;
  if (
    typeof timezone !== 'string' ||
    timezone.length === 0 ||
    !isValidTimezone(timezone)
  ) {
    setError('timezone', a.timezoneInvalid);
  }

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return {
    ok: true,
    timezone: timezone as string,
    rules: [...rules].sort(
      (x, y) => x.weekday - y.weekday || x.start.localeCompare(y.start),
    ),
  };
}
