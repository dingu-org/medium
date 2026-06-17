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
  getFreeSlots,
  rescheduleAppointment,
  transitionAppointment,
} from '@/lib/appointments';
import { db } from '@/lib/db';
import { appointments, patients, pts } from '@/lib/db/schema';
import { createServerClient } from '@/lib/supabase/server';

async function requirePtId(): Promise<string> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  return user.id;
}

export type ActionResult = { ok: boolean; error?: string };

function messageFor(error: unknown): string {
  if (error instanceof AppointmentError) {
    switch (error.code) {
      case 'unavailable':
      case 'conflict':
        return 'That time is no longer available.';
      case 'invalid_transition':
        return 'That change is not allowed for this appointment.';
      case 'not_found':
        return 'Appointment not found.';
      default:
        return 'Could not update the appointment.';
    }
  }
  return 'Something went wrong. Please try again.';
}

export async function cancelAppointmentAction(
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
    });
    revalidatePath('/calendar');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

const transitionSchema = z.enum(['confirmed', 'completed', 'no_show']);

export async function transitionAppointmentAction(
  appointmentId: string,
  nextStatus: 'confirmed' | 'completed' | 'no_show',
): Promise<ActionResult> {
  const ptId = await requirePtId();
  const parsed = transitionSchema.safeParse(nextStatus);
  if (!parsed.success) return { ok: false, error: 'Invalid status.' };
  try {
    await transitionAppointment({
      ptId,
      appointmentId,
      nextStatus: parsed.data,
    });
    revalidatePath('/calendar');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function rescheduleAppointmentAction(
  appointmentId: string,
  newStartsAt: string,
): Promise<ActionResult> {
  const ptId = await requirePtId();
  const date = new Date(newStartsAt);
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: 'Invalid time.' };
  }
  try {
    await rescheduleAppointment({ ptId, appointmentId, newStartsAt: date });
    revalidatePath('/calendar');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}

export async function updateAppointmentNotes(
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

export type SlotsByDay = { date: string; label: string; slots: string[] };

/** Free slots over the next 14 days for the reschedule / booking picker. */
export async function getUpcomingSlots(): Promise<{
  days: SlotsByDay[];
  timezone: string;
}> {
  const ptId = await requirePtId();
  const start = new Date();
  const end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);

  const { slots, timezone } = await getFreeSlots({ ptId, start, end });

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

export type PatientOption = { id: string; name: string; phone: string };

/** Patient picker search for manual booking (by name or phone). */
export async function searchPatients(
  query: string,
): Promise<PatientOption[]> {
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

const manualBookingSchema = z
  .object({
    patientId: z.uuid().optional(),
    newPatient: z
      .object({
        name: z.string().trim().min(1).max(120),
        phone: z.string().trim().min(3).max(40),
      })
      .optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Invalid time'),
    serviceType: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.patientId || v.newPatient, {
    message: 'Select or add a patient.',
  });

/**
 * Create an appointment manually. The PT can book any free time (working hours
 * are bypassed); double-booking is still blocked by the overlap constraint.
 */
export async function bookManualAppointment(input: {
  patientId?: string;
  newPatient?: { name: string; phone: string };
  date: string;
  time: string;
  serviceType?: string;
  notes?: string;
}): Promise<ActionResult> {
  const ptId = await requirePtId();
  const parsed = manualBookingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid' };
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
    const [created] = await db
      .insert(patients)
      .values({
        ptId,
        name: parsed.data.newPatient.name,
        phone: parsed.data.newPatient.phone,
      })
      .returning({ id: patients.id });
    patientId = created.id;
  }
  if (!patientId) return { ok: false, error: 'Select or add a patient.' };

  try {
    await bookAppointment({
      ptId,
      patientId,
      startsAt,
      serviceType: parsed.data.serviceType?.trim() || 'Appointment',
      notes: parsed.data.notes,
      allowOutsideAvailability: true,
    });
    revalidatePath('/calendar');
    return { ok: true };
  } catch (error) {
    return { ok: false, error: messageFor(error) };
  }
}
