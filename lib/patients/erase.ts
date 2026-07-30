import { createHash } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  auditLog,
  patients,
  whatsappContacts,
} from '@/lib/db/schema';
import {
  appendAppointmentEvent,
  eventPayloadFromAppointment,
} from '@/lib/events/appointments';
import { tryPublishOutboxEvent } from '@/lib/events/outbox';
import { recordErasureArchive } from '@/lib/gdpr/archive';
import { logger, serializeError } from '@/lib/log';
import { patientWhatsappContactsFilter } from './whatsapp-contacts';

export type ErasePatientResult = { erased: boolean };

/** Stable (key-sorted) hash of a row for a tamper-evident before-state proof. */
function canonicalHash(row: Record<string, unknown>): string {
  const sorted = Object.keys(row)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = row[key];
      return acc;
    }, {});
  return createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
}

/**
 * Right-to-erasure for one patient. Cancels scheduled reminders by emitting
 * `appointment.cancelled` (which trips sendReminder's cancelOn) inside the tx,
 * then cascade-deletes the patient (conversations → messages, appointments →
 * reminder_jobs go via FK). Events are published only after the tx commits, and
 * the audit row is written in-tx so the proof and the delete share one boundary.
 * The same proof is mirrored into erasure_archive after the commit because
 * audit_log is cascade-deleted with the PT, and the compliance record has to
 * outlive an account closure.
 * NOT deleted: the `conversation_days` metering facts. Their patient/conversation
 * references are ON DELETE SET NULL (migration 0025), so the billing days survive
 * anonymised — otherwise erasing a patient would retroactively lower the month's
 * metered usage (lib/billing/usage.ts counts these rows).
 * Idempotent: a missing patient is a no-op that writes and publishes nothing.
 */
export async function erasePatient(input: {
  patientId: string;
  ptId: string;
}): Promise<ErasePatientResult> {
  const { patientId, ptId } = input;

  const erasure = await db.transaction(async (tx) => {
    const [patient] = await tx
      .select()
      .from(patients)
      .where(and(eq(patients.id, patientId), eq(patients.ptId, ptId)))
      .limit(1)
      .for('update');
    if (!patient) {
      return { erased: false, eventIds: [] as string[], beforeStateHash: '' };
    }

    const beforeStateHash = canonicalHash(patient);

    const activeAppointments = await tx
      .select({
        id: appointments.id,
        ptId: appointments.ptId,
        patientId: appointments.patientId,
        startsAt: appointments.startsAt,
        endsAt: appointments.endsAt,
        serviceType: appointments.serviceType,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.ptId, ptId),
          eq(appointments.patientId, patientId),
          inArray(appointments.status, ['pending', 'confirmed']),
        ),
      );

    const eventIds: string[] = [];
    for (const appt of activeAppointments) {
      const eventId = await appendAppointmentEvent(tx, {
        type: 'appointment.cancelled',
        data: {
          ...eventPayloadFromAppointment(appt),
          status: 'cancelled',
          cancelledBy: 'pt',
          reason: 'patient_erased',
        },
      });
      eventIds.push(eventId);
    }

    await tx
      .delete(whatsappContacts)
      .where(patientWhatsappContactsFilter(patient));

    await tx.insert(auditLog).values({
      ptId,
      actor: 'pt',
      action: 'erasure',
      targetTable: 'patients',
      targetId: patientId,
      metadata: { beforeStateHash },
    });

    await tx
      .delete(patients)
      .where(and(eq(patients.id, patientId), eq(patients.ptId, ptId)));

    return { erased: true, eventIds, beforeStateHash };
  });
  const { erased, eventIds, beforeStateHash } = erasure;

  if (erased) {
    // Best-effort: the delete already committed, so a failed archive write must
    // not turn a completed erasure into an error for the PT.
    try {
      await recordErasureArchive({
        ptId,
        scope: 'patient',
        targetId: patientId,
        beforeStateHash,
        metadata: { erasedAt: new Date().toISOString() },
      });
    } catch (error) {
      logger.error(
        'patient.erasure_archive_failed',
        'Erasure archive write failed after commit',
        { pt_id: ptId, patient_id: patientId, ...serializeError(error) },
      );
    }
  }

  for (const id of eventIds) await tryPublishOutboxEvent(id);
  return { erased };
}
