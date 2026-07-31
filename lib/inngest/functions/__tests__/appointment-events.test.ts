import { describe, expect, it } from 'vitest';
import { appointmentEventPlan } from '../appointment-events';

const changeKinds = [
  'appointment.booked',
  'appointment.rescheduled',
  'appointment.cancelled',
] as const;

describe('appointmentEventPlan', () => {
  it('notifies and confirms for bookings and reschedules', () => {
    expect(appointmentEventPlan({ kind: 'appointment.booked' })).toEqual({
      notifyPt: true,
      confirmPatient: true,
    });
    expect(appointmentEventPlan({ kind: 'appointment.rescheduled' })).toEqual({
      notifyPt: true,
      confirmPatient: true,
    });
  });

  it('confirms a PT-side cancellation, the only one the patient has not heard about', () => {
    expect(
      appointmentEventPlan({
        kind: 'appointment.cancelled',
        cancelledBy: 'pt',
        cancellationReason: null,
      }),
    ).toEqual({ notifyPt: true, confirmPatient: true });
  });

  it.each(['patient', 'ai'] as const)(
    'suppresses the duplicate confirmation for a %s cancellation',
    (cancelledBy) => {
      expect(
        appointmentEventPlan({
          kind: 'appointment.cancelled',
          cancelledBy,
          cancellationReason: 'ANULO',
        }),
      ).toEqual({
        notifyPt: true,
        confirmPatient: false,
        skipped: 'conversation_replied',
      });
    },
  );

  it('treats a missing actor as not PT-initiated', () => {
    expect(
      appointmentEventPlan({ kind: 'appointment.cancelled' }),
    ).toMatchObject({
      confirmPatient: false,
      skipped: 'conversation_replied',
    });
  });

  it('does not let a patient reply spoof the erasure marker', () => {
    expect(
      appointmentEventPlan({
        kind: 'appointment.cancelled',
        cancelledBy: 'patient',
        cancellationReason: 'patient_erased',
      }),
    ).toMatchObject({ notifyPt: true, skipped: 'conversation_replied' });
  });

  it('drops both the PT push and the patient confirmation for a GDPR erasure', () => {
    expect(
      appointmentEventPlan({
        kind: 'appointment.cancelled',
        cancelledBy: 'pt',
        cancellationReason: 'patient_erased',
      }),
    ).toEqual({
      notifyPt: false,
      confirmPatient: false,
      skipped: 'patient_erased',
    });
  });

  // The turn that made the change already sent the patient this exact text, so
  // the background job is the second sender and must stay silent — the whole
  // point of routing on origin instead of guessing from timing.
  it.each(changeKinds)(
    'suppresses the confirmation for a conversation-originated %s',
    (kind) => {
      expect(
        appointmentEventPlan({
          kind,
          origin: 'conversation',
          cancelledBy: kind === 'appointment.cancelled' ? 'patient' : undefined,
        }),
      ).toEqual({
        notifyPt: true,
        confirmPatient: false,
        skipped: 'conversation_replied',
      });
    },
  );

  // Suppressing the patient confirmation must never suppress the PT's push:
  // she still has to see that her calendar moved.
  it.each(changeKinds)(
    'still pushes the PT for a conversation-originated %s',
    (kind) => {
      expect(
        appointmentEventPlan({ kind, origin: 'conversation' }).notifyPt,
      ).toBe(true);
    },
  );

  it.each(changeKinds)('confirms a PT-originated %s immediately', (kind) => {
    expect(
      appointmentEventPlan({
        kind,
        origin: 'pt',
        cancelledBy: kind === 'appointment.cancelled' ? 'pt' : undefined,
      }),
    ).toEqual({ notifyPt: true, confirmPatient: true });
  });

  // A cancellation the AI made carries cancelledBy 'patient' in the reminder
  // fallback, so the actor alone cannot decide — the explicit origin outranks it.
  it('routes an AI cancellation recorded as patient-initiated by its origin', () => {
    expect(
      appointmentEventPlan({
        kind: 'appointment.cancelled',
        origin: 'conversation',
        cancelledBy: 'patient',
      }),
    ).toMatchObject({ confirmPatient: false });
    expect(
      appointmentEventPlan({
        kind: 'appointment.cancelled',
        origin: 'pt',
        cancelledBy: 'patient',
      }),
    ).toMatchObject({ confirmPatient: true });
  });

  // Outbox rows written before `origin` existed must drain out behaving exactly
  // as they did: bookings and reschedules always confirmed, cancellations went
  // by actor.
  it.each(['appointment.booked', 'appointment.rescheduled'] as const)(
    'treats a %s with no origin as PT-initiated',
    (kind) => {
      expect(appointmentEventPlan({ kind })).toEqual({
        notifyPt: true,
        confirmPatient: true,
      });
      expect(appointmentEventPlan({ kind, origin: null })).toEqual({
        notifyPt: true,
        confirmPatient: true,
      });
    },
  );

  it('routes a cancellation with no origin by its actor', () => {
    expect(
      appointmentEventPlan({
        kind: 'appointment.cancelled',
        origin: null,
        cancelledBy: 'pt',
      }),
    ).toEqual({ notifyPt: true, confirmPatient: true });
    expect(
      appointmentEventPlan({
        kind: 'appointment.cancelled',
        origin: null,
        cancelledBy: 'ai',
      }),
    ).toEqual({
      notifyPt: true,
      confirmPatient: false,
      skipped: 'conversation_replied',
    });
  });

  it.each(['conversation', 'pt', null, undefined] as const)(
    'keeps a GDPR erasure fully silent with origin %s',
    (origin) => {
      expect(
        appointmentEventPlan({
          kind: 'appointment.cancelled',
          origin,
          cancelledBy: 'pt',
          cancellationReason: 'patient_erased',
        }),
      ).toEqual({
        notifyPt: false,
        confirmPatient: false,
        skipped: 'patient_erased',
      });
    },
  );
});
