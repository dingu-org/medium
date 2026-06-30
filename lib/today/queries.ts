import { TZDate } from '@date-fns/tz';
import { endOfDay, startOfDay } from 'date-fns';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lte,
  ne,
} from 'drizzle-orm';
import type { AppointmentView } from '@/components/appointments/types';
import { db } from '@/lib/db';
import {
  appointments,
  conversations,
  patients,
  pts,
  reminderJobs,
} from '@/lib/db/schema';
import { privacyName } from '@/lib/format/name';

export type TodayAppointment = AppointmentView & {
  startLabel: string;
  durationMinutes: number;
};

export type TodayAttention =
  | {
      kind: 'escalation';
      patientId: string;
      patientName: string;
      conversationId: string;
      appointment: null;
    }
  | {
      kind: 'reminder';
      patientId: string;
      patientName: string;
      conversationId: string | null;
      appointment: TodayAppointment;
    };

export type TodaySnapshot = {
  ptId: string;
  timezone: string;
  now: string;
  attention: TodayAttention[];
  next: TodayAppointment | null;
  later: TodayAppointment[];
  managedConversationCount: number;
};

function appointmentView(
  row: {
    id: string;
    startsAt: Date;
    endsAt: Date;
    serviceType: string | null;
    status: TodayAppointment['status'];
    notes: string | null;
    patientName: string;
    patientPhone: string;
    patientWaId: string | null;
    conversationId: string | null;
    reminderStatus: string | null;
    reminderResponse: string | null;
  },
  timezone: string,
): TodayAppointment {
  const start = new TZDate(row.startsAt, timezone);
  return {
    id: row.id,
    patientName: privacyName(row.patientName),
    patientPhone: row.patientPhone,
    patientWaId: row.patientWaId,
    conversationId: row.conversationId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    serviceType: row.serviceType,
    status: row.status,
    notes: row.notes,
    reminder: row.reminderStatus
      ? { status: row.reminderStatus, responseType: row.reminderResponse }
      : null,
    startLabel: new Intl.DateTimeFormat('sq-AL', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(start),
    durationMinutes: Math.round(
      (row.endsAt.getTime() - row.startsAt.getTime()) / 60_000,
    ),
  };
}

export async function getTodaySnapshot(
  ptId: string,
  now = new Date(),
): Promise<TodaySnapshot> {
  const [pt] = await db
    .select({ timezone: pts.timezone })
    .from(pts)
    .where(eq(pts.id, ptId))
    .limit(1);
  const timezone = pt?.timezone ?? 'Europe/Tirane';
  const zonedNow = new TZDate(now, timezone);
  const dayStart = new Date(startOfDay(zonedNow).getTime());
  const dayEnd = new Date(endOfDay(zonedNow).getTime());

  const [appointmentRows, escalationRows, reminderRows, managedRows] =
    await Promise.all([
      db
        .select({
          id: appointments.id,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
          serviceType: appointments.serviceType,
          status: appointments.status,
          notes: appointments.notes,
          patientName: patients.name,
          patientPhone: patients.phone,
          patientWaId: patients.waId,
          conversationId: conversations.id,
          reminderStatus: reminderJobs.status,
          reminderResponse: reminderJobs.responseType,
        })
        .from(appointments)
        .innerJoin(patients, eq(appointments.patientId, patients.id))
        .leftJoin(
          conversations,
          and(
            eq(conversations.patientId, appointments.patientId),
            eq(conversations.channel, 'whatsapp'),
          ),
        )
        .leftJoin(reminderJobs, eq(reminderJobs.appointmentId, appointments.id))
        .where(
          and(
            eq(appointments.ptId, ptId),
            inArray(appointments.status, ['pending', 'confirmed']),
            gt(appointments.endsAt, now),
            lte(appointments.startsAt, dayEnd),
            gt(appointments.endsAt, dayStart),
          ),
        )
        .orderBy(asc(appointments.startsAt)),
      db
        .select({
          patientId: patients.id,
          patientName: patients.name,
          conversationId: conversations.id,
        })
        .from(conversations)
        .innerJoin(patients, eq(conversations.patientId, patients.id))
        .where(
          and(
            eq(conversations.ptId, ptId),
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
          patientId: patients.id,
          patientName: patients.name,
          patientPhone: patients.phone,
          patientWaId: patients.waId,
          conversationId: conversations.id,
          id: appointments.id,
          startsAt: appointments.startsAt,
          endsAt: appointments.endsAt,
          serviceType: appointments.serviceType,
          status: appointments.status,
          notes: appointments.notes,
          reminderStatus: reminderJobs.status,
          reminderResponse: reminderJobs.responseType,
        })
        .from(reminderJobs)
        .innerJoin(
          appointments,
          eq(reminderJobs.appointmentId, appointments.id),
        )
        .innerJoin(patients, eq(appointments.patientId, patients.id))
        .leftJoin(
          conversations,
          and(
            eq(conversations.patientId, patients.id),
            eq(conversations.channel, 'whatsapp'),
          ),
        )
        .where(
          and(
            eq(reminderJobs.ptId, ptId),
            eq(reminderJobs.status, 'sent'),
            isNull(reminderJobs.responseType),
            inArray(appointments.status, ['pending', 'confirmed']),
            gt(appointments.startsAt, now),
          ),
        )
        .orderBy(asc(appointments.startsAt)),
      db
        .select({ value: count() })
        .from(conversations)
        .where(
          and(
            eq(conversations.ptId, ptId),
            eq(conversations.aiActive, true),
            eq(conversations.escalationState, 'idle'),
            isNull(conversations.closedAt),
          ),
        ),
    ]);

  const todayAppointments = appointmentRows.map((row) =>
    appointmentView(row, timezone),
  );
  const seenPatients = new Set<string>();
  const attention: TodayAttention[] = [];
  for (const row of escalationRows) {
    if (seenPatients.has(row.patientId)) continue;
    seenPatients.add(row.patientId);
    attention.push({
      kind: 'escalation',
      patientId: row.patientId,
      patientName: privacyName(row.patientName),
      conversationId: row.conversationId,
      appointment: null,
    });
  }
  for (const row of reminderRows) {
    if (seenPatients.has(row.patientId)) continue;
    seenPatients.add(row.patientId);
    attention.push({
      kind: 'reminder',
      patientId: row.patientId,
      patientName: privacyName(row.patientName),
      conversationId: row.conversationId,
      appointment: appointmentView(row, timezone),
    });
  }

  return {
    ptId,
    timezone,
    now: now.toISOString(),
    attention,
    next: todayAppointments[0] ?? null,
    later: todayAppointments.slice(1),
    managedConversationCount: managedRows[0]?.value ?? 0,
  };
}
