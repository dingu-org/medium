import { TZDate } from '@date-fns/tz';
import {
  differenceInCalendarDays,
  endOfDay,
  endOfISOWeek,
  startOfDay,
  startOfISOWeek,
} from 'date-fns';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
} from 'drizzle-orm';
import type { AppointmentView } from '@/components/appointments/types';
import { db } from '@/lib/db';
import {
  appointments,
  conversations,
  events,
  messages,
  customers,
  accounts,
  reminderJobs,
} from '@/lib/db/schema';
import { privacyName } from '@/lib/format/name';
import { formatDate, formatTime, formatWeekdayShort } from '@/lib/i18n';

export type TodayAppointment = AppointmentView & {
  startLabel: string;
  durationMinutes: number;
};

export type TodayAttention =
  | {
      kind: 'escalation';
      customerId: string;
      customerName: string;
      conversationId: string;
      appointment: null;
    }
  | {
      kind: 'reminder';
      customerId: string;
      customerName: string;
      conversationId: string | null;
      appointment: TodayAppointment;
    };

/** PT dashboard funnel widget: "This week — N messages, N bookings, N escalations". */
export type WeekStrip = {
  messagesReceived: number;
  bookings: number;
  escalations: number;
};

export type TodaySnapshot = {
  accountId: string;
  timezone: string;
  now: string;
  attention: TodayAttention[];
  next: TodayAppointment | null;
  later: TodayAppointment[];
  week: WeekStrip;
};

/**
 * Start label for a Sot row. Reminders go out 24h ahead, so an unanswered
 * reminder in "attention" normally belongs to a later day — a bare `10:00`
 * under today's date header reads as today, so name the day as well. Rows in
 * the timeline are always today (or already running), and keep the bare time.
 */
function startLabelFor(start: TZDate, zonedNow: TZDate): string {
  const time = formatTime(start);
  const days = differenceInCalendarDays(start, zonedNow);
  if (days <= 0) return time;
  if (days === 1) return `Nesër ${time}`;
  return `${formatWeekdayShort(start)} ${formatDate(start)}, ${time}`;
}

function appointmentView(
  row: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    serviceType: string | null;
    status: TodayAppointment['status'];
    notes: string | null;
    customerName: string;
    customerPhone: string;
    customerWaId: string | null;
    conversationId: string | null;
    reminderStatus: string | null;
    reminderResponse: string | null;
    reminderSkippedReason: string | null;
  },
  timezone: string,
  zonedNow: TZDate,
): TodayAppointment {
  const start = new TZDate(row.startsAt, timezone);
  return {
    id: row.id,
    customerName: privacyName(row.customerName),
    customerPhone: row.customerPhone,
    customerWaId: row.customerWaId,
    conversationId: row.conversationId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    serviceType: row.serviceType,
    status: row.status,
    notes: row.notes,
    reminder: row.reminderStatus
      ? {
          status: row.reminderStatus,
          responseType: row.reminderResponse,
          skippedReason: row.reminderSkippedReason,
        }
      : null,
    startLabel: startLabelFor(start, zonedNow),
    durationMinutes: Math.round(
      (row.endsAt.getTime() - row.startsAt.getTime()) / 60_000,
    ),
  };
}

export async function getTodaySnapshot(
  accountId: string,
  now = new Date(),
): Promise<TodaySnapshot> {
  const [account] = await db
    .select({ timezone: accounts.timezone })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  const timezone = account?.timezone ?? 'Europe/Tirane';
  const zonedNow = new TZDate(now, timezone);
  const dayStart = new Date(startOfDay(zonedNow).getTime());
  const dayEnd = new Date(endOfDay(zonedNow).getTime());
  // ISO week (Mon–Sun) in the PT's timezone, converted to plain Dates for
  // comparison against UTC-stored timestamps.
  const weekStart = new Date(startOfISOWeek(zonedNow).getTime());
  const weekEnd = new Date(endOfISOWeek(zonedNow).getTime());

  const [
    appointmentRows,
    escalationRows,
    reminderRows,
    [messagesWeekRow],
    [bookingsWeekRow],
    [escalationsWeekRow],
  ] = await Promise.all([
    db
      .select({
        id: appointments.id,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        serviceType: appointments.serviceType,
        status: appointments.status,
        notes: appointments.notes,
        customerName: customers.name,
        customerPhone: customers.phone,
        customerWaId: customers.waId,
        conversationId: conversations.id,
        reminderStatus: reminderJobs.status,
        reminderResponse: reminderJobs.responseType,
        reminderSkippedReason: reminderJobs.skippedReason,
      })
      .from(appointments)
      .innerJoin(customers, eq(appointments.customerId, customers.id))
      .leftJoin(
        conversations,
        and(
          eq(conversations.customerId, appointments.customerId),
          eq(conversations.channel, 'whatsapp'),
        ),
      )
      .leftJoin(reminderJobs, eq(reminderJobs.appointmentId, appointments.id))
      .where(
        and(
          eq(appointments.accountId, accountId),
          inArray(appointments.status, ['pending', 'confirmed']),
          gt(appointments.endsAt, now),
          lte(appointments.startsAt, dayEnd),
          gt(appointments.endsAt, dayStart),
        ),
      )
      .orderBy(asc(appointments.startsAt)),
    db
      .select({
        customerId: customers.id,
        customerName: customers.name,
        conversationId: conversations.id,
      })
      .from(conversations)
      .innerJoin(customers, eq(conversations.customerId, customers.id))
      .where(
        and(
          eq(conversations.accountId, accountId),
          isNull(conversations.closedAt),
          ne(conversations.escalationState, 'idle'),
        ),
      )
      .orderBy(
        desc(conversations.lastInboundAt),
        desc(conversations.createdAt),
      ),
    db
      .select({
        customerId: customers.id,
        customerName: customers.name,
        customerPhone: customers.phone,
        customerWaId: customers.waId,
        conversationId: conversations.id,
        id: appointments.id,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        serviceType: appointments.serviceType,
        status: appointments.status,
        notes: appointments.notes,
        reminderStatus: reminderJobs.status,
        reminderResponse: reminderJobs.responseType,
        reminderSkippedReason: reminderJobs.skippedReason,
      })
      .from(reminderJobs)
      .innerJoin(appointments, eq(reminderJobs.appointmentId, appointments.id))
      .innerJoin(customers, eq(appointments.customerId, customers.id))
      .leftJoin(
        conversations,
        and(
          eq(conversations.customerId, customers.id),
          eq(conversations.channel, 'whatsapp'),
        ),
      )
      .where(
        and(
          eq(reminderJobs.accountId, accountId),
          eq(reminderJobs.status, 'sent'),
          isNull(reminderJobs.responseType),
          inArray(appointments.status, ['pending', 'confirmed']),
          // Keep unanswered reminders in "attention" through the appointment
          // itself (a live no-reply is a possible no-show), not just until it
          // starts — dropping them at startsAt hid the no-reply signal.
          gt(appointments.endsAt, now),
        ),
      )
      .orderBy(asc(appointments.startsAt)),
    db
      .select({ value: count() })
      .from(messages)
      .where(
        and(
          eq(messages.accountId, accountId),
          eq(messages.role, 'customer'),
          gte(messages.createdAt, weekStart),
          lt(messages.createdAt, weekEnd),
        ),
      ),
    db
      .select({ value: count() })
      .from(appointments)
      .where(
        and(
          eq(appointments.accountId, accountId),
          gte(appointments.createdAt, weekStart),
          lt(appointments.createdAt, weekEnd),
        ),
      ),
    db
      .select({ value: count() })
      .from(events)
      .where(
        and(
          eq(events.accountId, accountId),
          eq(events.type, 'conversation.escalated'),
          gte(events.occurredAt, weekStart),
          lt(events.occurredAt, weekEnd),
        ),
      ),
  ]);

  const todayAppointments = appointmentRows.map((row) =>
    appointmentView(row, timezone, zonedNow),
  );
  const seenCustomers = new Set<string>();
  const attention: TodayAttention[] = [];
  for (const row of escalationRows) {
    if (seenCustomers.has(row.customerId)) continue;
    seenCustomers.add(row.customerId);
    attention.push({
      kind: 'escalation',
      customerId: row.customerId,
      customerName: privacyName(row.customerName),
      conversationId: row.conversationId,
      appointment: null,
    });
  }
  for (const row of reminderRows) {
    if (seenCustomers.has(row.customerId)) continue;
    seenCustomers.add(row.customerId);
    attention.push({
      kind: 'reminder',
      customerId: row.customerId,
      customerName: privacyName(row.customerName),
      conversationId: row.conversationId,
      appointment: appointmentView(row, timezone, zonedNow),
    });
  }

  return {
    accountId,
    timezone,
    now: now.toISOString(),
    attention,
    next: todayAppointments[0] ?? null,
    later: todayAppointments.slice(1),
    week: {
      messagesReceived: messagesWeekRow?.value ?? 0,
      bookings: bookingsWeekRow?.value ?? 0,
      escalations: escalationsWeekRow?.value ?? 0,
    },
  };
}
