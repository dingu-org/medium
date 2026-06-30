import { and, asc, desc, eq, ilike, inArray, or } from 'drizzle-orm';
import type { AppointmentView } from '@/components/appointments/types';
import { db } from '@/lib/db';
import {
  appointments,
  conversations,
  patients,
  pts,
  reminderJobs,
} from '@/lib/db/schema';

export type ClientDirectoryRow = {
  id: string;
  name: string;
  phone: string;
  manual: boolean;
  conversationId: string | null;
  nextAppointment: { startsAt: string; serviceType: string | null } | null;
  lastAppointment: { startsAt: string; serviceType: string | null } | null;
};

export type ClientDirectorySnapshot = {
  ptId: string;
  timezone: string;
  query: string;
  total: number;
  rows: ClientDirectoryRow[];
};

export type ClientDetailSnapshot = {
  id: string;
  ptId: string;
  name: string;
  phone: string;
  waId: string | null;
  manual: boolean;
  notes: string | null;
  reminderOptedOutAt: string | null;
  createdAt: string;
  conversationId: string | null;
  aiActive: boolean | null;
  timezone: string;
  upcoming: AppointmentView[];
  history: AppointmentView[];
};

export async function getClientDirectory(
  ptId: string,
  query = '',
): Promise<ClientDirectorySnapshot> {
  const normalized = query.trim();
  const [pt] = await db
    .select({ timezone: pts.timezone })
    .from(pts)
    .where(eq(pts.id, ptId))
    .limit(1);
  const patientRows = await db
    .select({
      id: patients.id,
      name: patients.name,
      phone: patients.phone,
      waId: patients.waId,
      conversationId: conversations.id,
    })
    .from(patients)
    .leftJoin(
      conversations,
      and(
        eq(conversations.patientId, patients.id),
        eq(conversations.channel, 'whatsapp'),
      ),
    )
    .where(
      normalized
        ? and(
            eq(patients.ptId, ptId),
            or(
              ilike(patients.name, `%${normalized}%`),
              ilike(patients.phone, `%${normalized}%`),
            ),
          )
        : eq(patients.ptId, ptId),
    )
    .orderBy(asc(patients.name))
    .limit(250);

  const ids = patientRows.map((patient) => patient.id);
  const appointmentRows = ids.length
    ? await db
        .select({
          patientId: appointments.patientId,
          startsAt: appointments.startsAt,
          serviceType: appointments.serviceType,
          status: appointments.status,
        })
        .from(appointments)
        .where(
          and(
            eq(appointments.ptId, ptId),
            inArray(appointments.patientId, ids),
          ),
        )
        .orderBy(desc(appointments.startsAt))
    : [];

  const now = Date.now();
  const byPatient = new Map<string, typeof appointmentRows>();
  for (const appointment of appointmentRows) {
    const list = byPatient.get(appointment.patientId) ?? [];
    list.push(appointment);
    byPatient.set(appointment.patientId, list);
  }

  const rows = patientRows.map((patient) => {
    const list = byPatient.get(patient.id) ?? [];
    const next = list
      .filter(
        (appointment) =>
          appointment.startsAt.getTime() >= now &&
          (appointment.status === 'pending' ||
            appointment.status === 'confirmed'),
      )
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
    const last = list.find(
      (appointment) => appointment.startsAt.getTime() < now,
    );
    return {
      id: patient.id,
      name: patient.name,
      phone: patient.phone,
      manual: !patient.waId,
      conversationId: patient.conversationId,
      nextAppointment: next
        ? {
            startsAt: next.startsAt.toISOString(),
            serviceType: next.serviceType,
          }
        : null,
      lastAppointment: last
        ? {
            startsAt: last.startsAt.toISOString(),
            serviceType: last.serviceType,
          }
        : null,
    };
  });

  return {
    ptId,
    timezone: pt?.timezone ?? 'Europe/Tirane',
    query: normalized,
    total: rows.length,
    rows,
  };
}

export async function getClientDetail(
  ptId: string,
  patientId: string,
): Promise<ClientDetailSnapshot | null> {
  const [patient] = await db
    .select({
      id: patients.id,
      ptId: patients.ptId,
      name: patients.name,
      phone: patients.phone,
      waId: patients.waId,
      notes: patients.notes,
      reminderOptedOutAt: patients.reminderOptedOutAt,
      createdAt: patients.createdAt,
      conversationId: conversations.id,
      aiActive: conversations.aiActive,
      timezone: pts.timezone,
    })
    .from(patients)
    .innerJoin(pts, eq(patients.ptId, pts.id))
    .leftJoin(
      conversations,
      and(
        eq(conversations.patientId, patients.id),
        eq(conversations.channel, 'whatsapp'),
      ),
    )
    .where(and(eq(patients.id, patientId), eq(patients.ptId, ptId)))
    .limit(1);
  if (!patient) return null;

  const rows = await db
    .select({
      id: appointments.id,
      startsAt: appointments.startsAt,
      endsAt: appointments.endsAt,
      serviceType: appointments.serviceType,
      status: appointments.status,
      notes: appointments.notes,
      reminderStatus: reminderJobs.status,
      reminderResponse: reminderJobs.responseType,
    })
    .from(appointments)
    .leftJoin(reminderJobs, eq(reminderJobs.appointmentId, appointments.id))
    .where(
      and(eq(appointments.ptId, ptId), eq(appointments.patientId, patientId)),
    )
    .orderBy(desc(appointments.startsAt));

  const mapped: AppointmentView[] = rows.map((row) => ({
    id: row.id,
    patientName: patient.name,
    patientPhone: patient.phone,
    patientWaId: patient.waId,
    conversationId: patient.conversationId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    serviceType: row.serviceType,
    status: row.status,
    notes: row.notes,
    reminder: row.reminderStatus
      ? { status: row.reminderStatus, responseType: row.reminderResponse }
      : null,
  }));
  const now = Date.now();
  const upcoming = mapped
    .filter(
      (appointment) =>
        new Date(appointment.startsAt).getTime() >= now &&
        (appointment.status === 'pending' ||
          appointment.status === 'confirmed'),
    )
    .sort(
      (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
    );
  const upcomingIds = new Set(upcoming.map((appointment) => appointment.id));

  return {
    id: patient.id,
    ptId: patient.ptId,
    name: patient.name,
    phone: patient.phone,
    waId: patient.waId,
    manual: !patient.waId,
    notes: patient.notes,
    reminderOptedOutAt: patient.reminderOptedOutAt?.toISOString() ?? null,
    createdAt: patient.createdAt.toISOString(),
    conversationId: patient.conversationId,
    aiActive: patient.aiActive,
    timezone: patient.timezone,
    upcoming,
    history: mapped.filter((appointment) => !upcomingIds.has(appointment.id)),
  };
}
