import { TZDate } from '@date-fns/tz';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  AppointmentError,
  bookAppointment,
  cancelAppointment,
  rescheduleAppointment,
  transitionAppointment,
} from '@/lib/appointments';
import { db } from '@/lib/db';
import { appointments, pts } from '@/lib/db/schema';
import { getPwaPtId } from '@/lib/pwa/auth';
import { resolveBookingService } from '@/lib/services/queries';
import { createManualPatient } from '@/lib/clients/mutations';
import {
  beginPwaMutation,
  completePwaMutation,
  failPwaMutation,
  recordPwaMutationProgress,
} from '@/lib/pwa/mutation-store';

export const runtime = 'nodejs';
// Keep an attempt shorter than the ledger's stale-processing window so a still
// running attempt can never be reclaimed as abandoned (mutation-store.ts).
export const maxDuration = 60;

const clientMutationId = z.uuid();
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const manualBookSchema = z
  .object({
    clientMutationId,
    action: z.literal('manual_book'),
    patientId: z.uuid().optional(),
    newPatient: z
      .object({
        name: z.string().trim().min(1).max(120),
        phone: z.string().trim().min(3).max(40),
      })
      .optional(),
    date,
    time,
    serviceId: z.uuid().optional(),
    serviceType: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.patientId || v.newPatient, {
    message: 'Zgjidh ose shto një klient.',
  });

const schema = z.discriminatedUnion('action', [
  manualBookSchema,
  z.object({
    clientMutationId,
    action: z.literal('cancel'),
    appointmentId: z.uuid(),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    clientMutationId,
    action: z.literal('reschedule'),
    appointmentId: z.uuid(),
    newStartsAt: z.string().datetime(),
  }),
  z.object({
    clientMutationId,
    action: z.literal('transition'),
    appointmentId: z.uuid(),
    nextStatus: z.enum(['confirmed', 'completed', 'no_show']),
  }),
  z.object({
    clientMutationId,
    action: z.literal('notes'),
    appointmentId: z.uuid(),
    notes: z.string().max(1000),
  }),
]);

type AppointmentInput = z.infer<typeof schema>;

function jsonError(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const ptId = await getPwaPtId();
  if (!ptId) return jsonError('Pa autorizim', 401);

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    // zod's built-in issue text is English ("Invalid uuid") and this message is
    // rendered to the PT in the failed-changes banner, so only our own Albanian
    // `message` overrides may be surfaced; everything else falls back.
    const issue = parsed.error.issues[0];
    const custom = issue?.code === 'custom' ? issue.message : undefined;
    return jsonError(custom ?? 'Kërkesa nuk është e vlefshme.', 400);
  }
  const input = parsed.data;

  const started = await beginPwaMutation({
    ptId,
    clientMutationId: input.clientMutationId,
    type: `appointment.${input.action}`,
  });
  if (started.kind === 'success') return NextResponse.json(started.result);
  if (started.kind === 'failed') return jsonError(started.error, 409);
  if (started.kind === 'processing') {
    return jsonError('Ndryshimi është ende duke u përpunuar.', 503);
  }

  // A stale-reclaimed 'new' carries whatever the crashed attempt already got
  // done (bookManual below); a genuinely first attempt has nothing to resume.
  const priorProgress = started.kind === 'new' ? started.priorProgress : null;

  try {
    const result = await runAppointmentMutation(ptId, input, priorProgress);
    await completePwaMutation({
      ptId,
      clientMutationId: input.clientMutationId,
      result,
    });
    return NextResponse.json(result);
  } catch (error) {
    const { message, status } = messageFor(error);
    if (status < 500) {
      await failPwaMutation({
        ptId,
        clientMutationId: input.clientMutationId,
        error: message,
      });
    }
    return jsonError(message, status);
  }
}

async function runAppointmentMutation(
  ptId: string,
  input: AppointmentInput,
  priorProgress: Record<string, unknown> | null,
): Promise<{ ok: true; appointmentId: string }> {
  if (input.action === 'manual_book') {
    const appointment = await bookManual(ptId, input, priorProgress);
    return { ok: true, appointmentId: appointment.id };
  }
  if (input.action === 'cancel') {
    const appointment = await cancelAppointment({
      ptId,
      appointmentId: input.appointmentId,
      cancelledBy: 'pt',
      reason: input.reason,
    });
    return { ok: true, appointmentId: appointment.id };
  }
  if (input.action === 'reschedule') {
    const dateValue = new Date(input.newStartsAt);
    const appointment = await rescheduleAppointment({
      ptId,
      appointmentId: input.appointmentId,
      newStartsAt: dateValue,
    });
    return { ok: true, appointmentId: appointment.id };
  }
  if (input.action === 'transition') {
    const appointment = await transitionAppointment({
      ptId,
      appointmentId: input.appointmentId,
      nextStatus: input.nextStatus,
    });
    return { ok: true, appointmentId: appointment.id };
  }

  // `.returning()` so a stale id (deleted client, another tenant) fails as
  // 'not_found' instead of reporting a saved note the DB never took.
  const updated = await db
    .update(appointments)
    .set({ notes: input.notes.trim() || null })
    .where(
      and(
        eq(appointments.id, input.appointmentId),
        eq(appointments.ptId, ptId),
      ),
    )
    .returning({ id: appointments.id });
  if (updated.length === 0) {
    throw new AppointmentError('not_found', 'Takimi nuk u gjet.');
  }
  return { ok: true, appointmentId: input.appointmentId };
}

/** Where bookManual stashes the patient it created, for a reclaimed retry. */
function priorCreatedPatientId(
  progress: Record<string, unknown> | null,
): string | null {
  const value = progress?.createdPatientId;
  return typeof value === 'string' ? value : null;
}

async function bookManual(
  ptId: string,
  input: z.infer<typeof manualBookSchema>,
  priorProgress: Record<string, unknown> | null,
) {
  const [pt] = await db
    .select({ timezone: pts.timezone })
    .from(pts)
    .where(eq(pts.id, ptId))
    .limit(1);
  const timezone = pt?.timezone ?? 'Europe/Berlin';
  const [year, month, day] = input.date.split('-').map(Number);
  const [h, m] = input.time.split(':').map(Number);
  const startsAt = new Date(
    new TZDate(year, month - 1, day, h, m, 0, 0, timezone).getTime(),
  );

  let patientId = input.patientId;
  if (!patientId && input.newPatient) {
    // createManualPatient and the booking below are two separate writes, not
    // one transaction. If a prior attempt at this same clientMutationId
    // created the patient and then died before booking committed, a plain
    // retry would call createManualPatient again, get DUPLICATE_PHONE for the
    // patient it just made, and dead-end permanently on a misleading "client
    // already exists" error despite never having booked anything. Reuse the
    // stashed id instead of re-creating.
    const priorPatientId = priorCreatedPatientId(priorProgress);
    if (priorPatientId) {
      patientId = priorPatientId;
    } else {
      const created = await createManualPatient({ ptId, ...input.newPatient });
      if ('failure' in created) {
        throw new AppointmentError(
          'invalid_input',
          created.failure === 'DUPLICATE_PHONE'
            ? 'Një klient me këtë numër ekziston tashmë.'
            : 'Numri i telefonit nuk është i vlefshëm.',
        );
      }
      patientId = created.id;
      await recordPwaMutationProgress({
        ptId,
        clientMutationId: input.clientMutationId,
        progress: { createdPatientId: created.id },
      });
    }
  }
  if (!patientId) {
    throw new AppointmentError('invalid_input', 'Zgjidh ose shto një klient.');
  }
  const service = await resolveBookingService(ptId, {
    serviceId: input.serviceId,
    legacyServiceType: input.serviceType,
  });
  if (!service) {
    throw new AppointmentError('invalid_input', 'Zgjidh një shërbim aktiv.');
  }

  return bookAppointment({
    ptId,
    patientId,
    startsAt,
    serviceType: service.name,
    durationMinutes: service.durationMinutes,
    notes: input.notes,
    allowOutsideAvailability: true,
  });
}

function messageFor(error: unknown): { message: string; status: number } {
  if (error instanceof AppointmentError) {
    switch (error.code) {
      case 'unavailable':
      case 'conflict':
        return { message: 'Ky orar nuk është më i lirë.', status: 409 };
      case 'invalid_transition':
        return {
          message: 'Ky ndryshim nuk lejohet për këtë takim.',
          status: 409,
        };
      case 'not_found':
        return { message: 'Takimi nuk u gjet.', status: 404 };
      case 'invalid_input':
        // Every invalid_input raised in this file carries Albanian, PT-facing
        // copy ("Zgjidh një shërbim aktiv."), so it is safe to surface verbatim.
        return { message: error.message, status: 400 };
      default:
        return { message: 'Takimi nuk u përditësua.', status: 400 };
    }
  }
  return { message: 'Diçka shkoi keq. Provo sërish.', status: 500 };
}
