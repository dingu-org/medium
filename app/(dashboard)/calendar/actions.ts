'use server';

import { TZDate } from '@date-fns/tz';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  AppointmentError,
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  transitionAppointment,
} from '@/lib/appointments';
import { getFreeSlotsInternal } from '@/lib/appointments/availability';
import { db } from '@/lib/db';
import { appointments, patients, pts } from '@/lib/db/schema';
import { instrumentedAction } from '@/lib/actions/instrument';
import { createServerClient } from '@/lib/supabase/server';
import { resolveBookingService } from '@/lib/services/queries';
import { createManualPatient } from '@/lib/clients/mutations';

async function requirePtId(): Promise<string> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  return user.id;
}

export type ActionResult = { ok: boolean; error?: string; code?: string };

function messageFor(error: unknown): string {
  if (error instanceof AppointmentError) {
    switch (error.code) {
      case 'unavailable':
      case 'conflict':
        return 'Ky orar nuk është më i lirë.';
      case 'invalid_transition':
        return 'Ky ndryshim nuk lejohet për këtë takim.';
      case 'not_found':
        return 'Takimi nuk u gjet.';
      default:
        return 'Takimi nuk u përditësua.';
    }
  }
  return 'Diçka shkoi keq. Provo sërish.';
}

async function cancelAppointmentActionImpl(
  appointmentId: string,
  reason?: string,
): Promise<ActionResult> {
  const ptId = await requirePtId();
  try {
    await cancelAppointment({
      ptId,
      appointmentId,
      cancelledBy: 'pt',
      reason: reason?.trim() || undefined,
      origin: 'pt',
    });
    revalidatePath('/calendar');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export const cancelAppointmentAction = instrumentedAction(
  'calendar.cancelAppointmentAction',
  cancelAppointmentActionImpl,
);

const transitionSchema = z.enum(['confirmed', 'completed', 'no_show']);

async function transitionAppointmentActionImpl(
  appointmentId: string,
  nextStatus: 'confirmed' | 'completed' | 'no_show',
): Promise<ActionResult> {
  const ptId = await requirePtId();
  const parsed = transitionSchema.safeParse(nextStatus);
  if (!parsed.success)
    return {
      ok: false,
      code: 'INVALID_STATUS',
      error: 'Statusi nuk është i vlefshëm.',
    };
  try {
    await transitionAppointment({
      ptId,
      appointmentId,
      nextStatus: parsed.data,
      origin: 'pt',
    });
    revalidatePath('/calendar');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export const transitionAppointmentAction = instrumentedAction(
  'calendar.transitionAppointmentAction',
  transitionAppointmentActionImpl,
);

async function rescheduleAppointmentActionImpl(
  appointmentId: string,
  newStartsAt: string,
): Promise<ActionResult> {
  const ptId = await requirePtId();
  const date = new Date(newStartsAt);
  if (Number.isNaN(date.getTime())) {
    return {
      ok: false,
      code: 'INVALID_TIME',
      error: 'Orari nuk është i vlefshëm.',
    };
  }
  try {
    await rescheduleAppointment({
      ptId,
      appointmentId,
      newStartsAt: date,
      origin: 'pt',
    });
    revalidatePath('/calendar');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export const rescheduleAppointmentAction = instrumentedAction(
  'calendar.rescheduleAppointmentAction',
  rescheduleAppointmentActionImpl,
);

async function updateAppointmentNotesImpl(
  appointmentId: string,
  notes: string,
): Promise<ActionResult> {
  const ptId = await requirePtId();
  await db
    .update(appointments)
    .set({ notes: notes.trim() || null })
    .where(
      and(eq(appointments.id, appointmentId), eq(appointments.ptId, ptId)),
    );
  revalidatePath('/calendar');
  return { ok: true };
}

export const updateAppointmentNotes = instrumentedAction(
  'calendar.updateAppointmentNotes',
  updateAppointmentNotesImpl,
);

export type SlotsByDay = { date: string; label: string; slots: string[] };

const upcomingSlotsSchema = z.object({
  durationMinutes: z.number().int().min(5).max(480).optional(),
  excludeAppointmentId: z.uuid().optional(),
});

/**
 * Free slots over the next 14 days for the reschedule / booking picker. Pass
 * the appointment's own length (and id) when rescheduling, so the offered grid
 * matches the service being moved instead of the hourly default.
 */
async function getUpcomingSlotsImpl(options?: {
  durationMinutes?: number;
  excludeAppointmentId?: string;
}): Promise<{
  days: SlotsByDay[];
  timezone: string;
}> {
  const ptId = await requirePtId();
  const parsed = upcomingSlotsSchema.safeParse(options ?? {});
  const start = new Date();
  const end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);

  const { slots, timezone } = await getFreeSlotsInternal({
    ptId,
    start,
    end,
    durationMinutes: parsed.success ? parsed.data.durationMinutes : undefined,
    excludeAppointmentId: parsed.success
      ? parsed.data.excludeAppointmentId
      : undefined,
  });

  const byDay = new Map<string, string[]>();
  const fmtDay = new Intl.DateTimeFormat('en', {
    timeZone: timezone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  const fmtKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  for (const slot of slots) {
    const d = new Date(slot.startsAt);
    const key = fmtKey.format(d);
    const list = byDay.get(key) ?? [];
    list.push(slot.startsAt);
    byDay.set(key, list);
  }

  const days: SlotsByDay[] = [...byDay.entries()].map(([date, list]) => ({
    date,
    label: fmtDay.format(new Date(list[0])),
    slots: list,
  }));

  return { days, timezone };
}

export const getUpcomingSlots = instrumentedAction(
  'calendar.getUpcomingSlots',
  getUpcomingSlotsImpl,
);

export type PatientOption = { id: string; name: string; phone: string };

/** Patient picker search for manual booking (by name or phone). */
async function searchPatientsImpl(query: string): Promise<PatientOption[]> {
  const ptId = await requirePtId();
  const q = query.trim();
  const where = q
    ? and(
        eq(patients.ptId, ptId),
        or(ilike(patients.name, `%${q}%`), ilike(patients.phone, `%${q}%`)),
      )
    : eq(patients.ptId, ptId);

  return db
    .select({ id: patients.id, name: patients.name, phone: patients.phone })
    .from(patients)
    .where(where)
    .orderBy(desc(patients.createdAt))
    .limit(20);
}

export const searchPatients = instrumentedAction(
  'calendar.searchPatients',
  searchPatientsImpl,
);

const manualBookingSchema = z
  .object({
    patientId: z.uuid().optional(),
    newPatient: z
      .object({
        name: z.string().trim().min(1).max(120),
        phone: z.string().trim().min(3).max(40),
      })
      .optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data nuk është e vlefshme'),
    time: z
      .string()
      .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Ora nuk është e vlefshme'),
    serviceId: z.uuid().optional(),
    serviceType: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.patientId || v.newPatient, {
    message: 'Zgjidh ose shto një klient.',
  });

/**
 * Create an appointment manually. The PT can book any free time (working hours
 * are bypassed); double-booking is still blocked by the overlap constraint.
 */
async function bookManualAppointmentImpl(input: {
  patientId?: string;
  newPatient?: { name: string; phone: string };
  date: string;
  time: string;
  serviceId?: string;
  serviceType?: string;
  notes?: string;
}): Promise<ActionResult> {
  const ptId = await requirePtId();
  const parsed = manualBookingSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      code: 'INVALID_INPUT',
      error:
        parsed.error.issues[0]?.message ?? 'Të dhënat nuk janë të vlefshme.',
    };
  }

  const [pt] = await db
    .select({ timezone: pts.timezone })
    .from(pts)
    .where(eq(pts.id, ptId))
    .limit(1);
  const timezone = pt?.timezone ?? 'Europe/Berlin';

  const [year, month, day] = parsed.data.date.split('-').map(Number);
  const [h, m] = parsed.data.time.split(':').map(Number);
  const startsAt = new Date(
    new TZDate(year, month - 1, day, h, m, 0, 0, timezone).getTime(),
  );

  let patientId = parsed.data.patientId;
  if (!patientId && parsed.data.newPatient) {
    const created = await createManualPatient({
      ptId,
      ...parsed.data.newPatient,
    });
    if ('failure' in created) {
      return {
        ok: false,
        code: created.failure,
        error:
          created.failure === 'DUPLICATE_PHONE'
            ? 'Një klient me këtë numër ekziston tashmë.'
            : 'Numri i telefonit nuk është i vlefshëm.',
      };
    }
    patientId = created.id;
  }
  if (!patientId)
    return {
      ok: false,
      code: 'PATIENT_REQUIRED',
      error: 'Zgjidh ose shto një klient.',
    };

  const service = await resolveBookingService(ptId, {
    serviceId: parsed.data.serviceId,
    legacyServiceType: parsed.data.serviceType,
  });
  if (!service) {
    return { ok: false, error: 'Zgjidh një shërbim aktiv.' };
  }

  try {
    await bookAppointment({
      ptId,
      patientId,
      startsAt,
      serviceType: service.name,
      durationMinutes: service.durationMinutes,
      notes: parsed.data.notes,
      allowOutsideAvailability: true,
      origin: 'pt',
    });
    revalidatePath('/calendar');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export const bookManualAppointment = instrumentedAction(
  'calendar.bookManualAppointment',
  bookManualAppointmentImpl,
);
