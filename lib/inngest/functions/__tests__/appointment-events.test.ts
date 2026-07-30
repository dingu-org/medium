import { describe, expect, it } from 'vitest';
import { appointmentEventPlan } from '../appointment-events';

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
        skipped: 'actor_already_replied',
      });
    },
  );

  it('treats a missing actor as not PT-initiated', () => {
    expect(
      appointmentEventPlan({ kind: 'appointment.cancelled' }),
    ).toMatchObject({
      confirmPatient: false,
      skipped: 'actor_already_replied',
    });
  });

  it('does not let a patient reply spoof the erasure marker', () => {
    expect(
      appointmentEventPlan({
        kind: 'appointment.cancelled',
        cancelledBy: 'patient',
        cancellationReason: 'patient_erased',
      }),
    ).toMatchObject({ notifyPt: true, skipped: 'actor_already_replied' });
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
});
