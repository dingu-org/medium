import { TZDate } from '@date-fns/tz';
import { addDays, startOfDay } from 'date-fns';
import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { AppointmentError } from './errors';
import type { FreeSlot } from './types';

const DEFAULT_DURATION_MINUTES = 60;
const MAX_WINDOW_MS = 31 * 24 * 60 * 60 * 1000;

type AvailabilityRuleRow = {
  weekday: number;
  startTime: string;
  endTime: string;
};

type BusyPeriodRow = {
  startsAt: string;
  endsAt: string;
};

type AvailabilitySnapshot = {
  timezone: string;
  rules: AvailabilityRuleRow[];
  blocked: BusyPeriodRow[];
  appointments: BusyPeriodRow[];
};

type AvailabilityQueryRow = {
  timezone: string;
  rules: AvailabilityRuleRow[];
  blocked: BusyPeriodRow[];
  appointments: BusyPeriodRow[];
};

type GetFreeSlotsInput = {
  ptId: string;
  start: Date;
  end: Date;
  durationMinutes?: number;
  serviceType?: string;
};

type InternalGetFreeSlotsInput = GetFreeSlotsInput & {
  excludeAppointmentId?: string;
};

type IsSlotBookableInput = {
  ptId: string;
  startsAt: Date;
  endsAt: Date;
  excludeAppointmentId?: string;
};

function assertValidTimezone(timezone: string): void {
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
  } catch {
    throw new AppointmentError(
      'invalid_input',
      `The practice timezone "${timezone}" is invalid.`,
    );
  }
}

function assertValidRange(
  start: Date,
  end: Date,
  durationMinutes: number,
): void {
  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    end <= start
  ) {
    throw new AppointmentError(
      'invalid_input',
      'Availability end must be after start.',
    );
  }
  if (end.getTime() - start.getTime() > MAX_WINDOW_MS) {
    throw new AppointmentError(
      'invalid_input',
      'Availability windows cannot exceed 31 days.',
    );
  }
  if (
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 5 ||
    durationMinutes > 480
  ) {
    throw new AppointmentError(
      'invalid_input',
      'Appointment duration must be a whole number from 5 to 480 minutes.',
    );
  }
}

function timeToSeconds(value: string): number {
  const [hours, minutes, seconds] = value.split(':').map(Number);
  return (hours ?? 0) * 3600 + (minutes ?? 0) * 60 + (seconds ?? 0);
}

function localDateTime(
  day: TZDate,
  secondsSinceMidnight: number,
  timezone: string,
): TZDate | null {
  const targetDay = addDays(day, Math.floor(secondsSinceMidnight / 86_400));
  const wallSeconds = secondsSinceMidnight % 86_400;
  const hours = Math.floor(wallSeconds / 3600);
  const minutes = Math.floor((wallSeconds % 3600) / 60);
  const seconds = wallSeconds % 60;
  const result = new TZDate(
    targetDay.getFullYear(),
    targetDay.getMonth(),
    targetDay.getDate(),
    hours,
    minutes,
    seconds,
    0,
    timezone,
  );

  // A spring-forward wall time is normalized by Date. Reject it instead of
  // silently offering a different local time.
  if (
    result.getFullYear() !== targetDay.getFullYear() ||
    result.getMonth() !== targetDay.getMonth() ||
    result.getDate() !== targetDay.getDate() ||
    result.getHours() !== hours ||
    result.getMinutes() !== minutes ||
    result.getSeconds() !== seconds
  ) {
    return null;
  }
  return result;
}

function sameWallTime(date: TZDate, secondsSinceMidnight: number): boolean {
  return (
    date.getHours() === Math.floor(secondsSinceMidnight / 3600) &&
    date.getMinutes() === Math.floor((secondsSinceMidnight % 3600) / 60) &&
    date.getSeconds() === secondsSinceMidnight % 60
  );
}

function overlaps(
  startsAt: Date,
  endsAt: Date,
  period: BusyPeriodRow,
): boolean {
  return (
    startsAt < new Date(period.endsAt) && endsAt > new Date(period.startsAt)
  );
}

async function loadSnapshot(args: {
  ptId: string;
  start: Date;
  end: Date;
  excludeAppointmentId?: string;
}): Promise<AvailabilitySnapshot> {
  const exclude = args.excludeAppointmentId ?? null;
  const startIso = args.start.toISOString();
  const endIso = args.end.toISOString();
  const rows = await db.execute<AvailabilityQueryRow>(sql`
    SELECT
      p.timezone,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'weekday', r.weekday,
          'startTime', r.start_time::text,
          'endTime', r.end_time::text
        ) ORDER BY r.weekday, r.start_time)
        FROM availability_rules r
        WHERE r.pt_id = p.id
      ), '[]'::jsonb) AS rules,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'startsAt', b.starts_at,
          'endsAt', b.ends_at
        ) ORDER BY b.starts_at)
        FROM blocked_periods b
        WHERE b.pt_id = p.id
          AND b.starts_at < ${endIso}::timestamptz
          AND b.ends_at > ${startIso}::timestamptz
      ), '[]'::jsonb) AS blocked,
      COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'startsAt', a.starts_at,
          'endsAt', a.ends_at
        ) ORDER BY a.starts_at)
        FROM appointments a
        WHERE a.pt_id = p.id
          AND a.status IN ('pending', 'confirmed')
          AND a.starts_at < ${endIso}::timestamptz
          AND a.ends_at > ${startIso}::timestamptz
          AND (${exclude}::uuid IS NULL OR a.id <> ${exclude}::uuid)
      ), '[]'::jsonb) AS appointments
    FROM pts p
    WHERE p.id = ${args.ptId}
    LIMIT 1
  `);

  const snapshot = rows[0];
  if (!snapshot) {
    throw new AppointmentError('not_found', 'The practice was not found.');
  }
  return snapshot;
}

export async function getFreeSlots(
  input: GetFreeSlotsInput,
): Promise<{ slots: FreeSlot[]; timezone: string }> {
  return getFreeSlotsInternal(input);
}

export async function getFreeSlotsInternal(
  input: InternalGetFreeSlotsInput,
): Promise<{ slots: FreeSlot[]; timezone: string }> {
  const durationMinutes = input.durationMinutes ?? DEFAULT_DURATION_MINUTES;
  assertValidRange(input.start, input.end, durationMinutes);

  const snapshot = await loadSnapshot(input);
  assertValidTimezone(snapshot.timezone);
  if (snapshot.rules.length === 0) {
    return { slots: [], timezone: snapshot.timezone };
  }

  const rulesByWeekday = new Map<number, AvailabilityRuleRow[]>();
  for (const rule of snapshot.rules) {
    const rules = rulesByWeekday.get(rule.weekday) ?? [];
    rules.push(rule);
    rulesByWeekday.set(rule.weekday, rules);
  }

  const slots: FreeSlot[] = [];
  const seenSlots = new Set<string>();
  let day = startOfDay(new TZDate(input.start, snapshot.timezone));
  const finalDay = startOfDay(new TZDate(input.end, snapshot.timezone));

  while (day <= finalDay) {
    for (const rule of rulesByWeekday.get(day.getDay()) ?? []) {
      const ruleStartSeconds = timeToSeconds(rule.startTime);
      const ruleEndSeconds = timeToSeconds(rule.endTime);
      const durationSeconds = durationMinutes * 60;

      for (
        let cursor = ruleStartSeconds;
        cursor + durationSeconds <= ruleEndSeconds;
        cursor += durationSeconds
      ) {
        let slotStart = localDateTime(day, cursor, snapshot.timezone);
        const slotEnd = localDateTime(
          day,
          cursor + durationSeconds,
          snapshot.timezone,
        );
        if (!slotStart || !slotEnd || slotEnd <= slotStart) continue;

        const expectedDurationMs = durationMinutes * 60_000;
        const actualDurationMs = slotEnd.getTime() - slotStart.getTime();
        if (actualDurationMs > expectedDurationMs) {
          const secondOccurrence = new TZDate(
            slotStart.getTime() + actualDurationMs - expectedDurationMs,
            snapshot.timezone,
          );
          if (
            sameWallTime(secondOccurrence, cursor) &&
            slotEnd.getTime() - secondOccurrence.getTime() ===
              expectedDurationMs
          ) {
            slotStart = secondOccurrence;
          }
        }
        if (slotEnd.getTime() - slotStart.getTime() !== expectedDurationMs) {
          continue;
        }

        if (slotStart < input.start || slotEnd > input.end) continue;
        if (
          snapshot.blocked.some((period) =>
            overlaps(slotStart, slotEnd, period),
          ) ||
          snapshot.appointments.some((period) =>
            overlaps(slotStart, slotEnd, period),
          )
        ) {
          continue;
        }
        const startsAt = new Date(slotStart.getTime()).toISOString();
        const endsAt = new Date(slotEnd.getTime()).toISOString();
        const key = `${startsAt}/${endsAt}`;
        if (!seenSlots.has(key)) {
          seenSlots.add(key);
          slots.push({ startsAt, endsAt });
        }
      }
    }
    day = addDays(day, 1);
  }

  return { slots, timezone: snapshot.timezone };
}

/**
 * Whether an exact interval can be booked: it must sit wholly inside one
 * working-hours rule and overlap no blocked period or active appointment.
 *
 * The grids returned by `getFreeSlots` are stepped by a single duration, so
 * asking whether a requested time is a member of one of them rejects perfectly
 * free times whenever the offered step and the booked service differ (a 45-min
 * service against an hourly picker). Validate the interval itself instead.
 */
export async function isSlotBookable(
  input: IsSlotBookableInput,
): Promise<boolean> {
  const durationMinutes = Math.round(
    (input.endsAt.getTime() - input.startsAt.getTime()) / 60_000,
  );
  assertValidRange(input.startsAt, input.endsAt, durationMinutes);

  const snapshot = await loadSnapshot({
    ptId: input.ptId,
    start: input.startsAt,
    end: input.endsAt,
    excludeAppointmentId: input.excludeAppointmentId,
  });
  assertValidTimezone(snapshot.timezone);

  if (
    snapshot.blocked.some((period) =>
      overlaps(input.startsAt, input.endsAt, period),
    ) ||
    snapshot.appointments.some((period) =>
      overlaps(input.startsAt, input.endsAt, period),
    )
  ) {
    return false;
  }

  // A rule ending at 24:00 covers instants that fall on the next local day, so
  // check the slot's own day and the one before it.
  const slotDay = startOfDay(new TZDate(input.startsAt, snapshot.timezone));
  for (const day of [addDays(slotDay, -1), slotDay]) {
    for (const rule of snapshot.rules) {
      if (rule.weekday !== day.getDay()) continue;
      const ruleStart = localDateTime(
        day,
        timeToSeconds(rule.startTime),
        snapshot.timezone,
      );
      const ruleEnd = localDateTime(
        day,
        timeToSeconds(rule.endTime),
        snapshot.timezone,
      );
      if (!ruleStart || !ruleEnd) continue;
      if (
        ruleStart.getTime() <= input.startsAt.getTime() &&
        input.endsAt.getTime() <= ruleEnd.getTime()
      ) {
        return true;
      }
    }
  }
  return false;
}
