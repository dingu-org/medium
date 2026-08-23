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
      notifyAccount: true,
      confirmCustomer: true,
    });
    expect(appointmentEventPlan({ kind: 'appointment.rescheduled' })).toEqual({
      notifyAccount: true,
      confirmCustomer: true,
    });
  });

  it('confirms a PT-side cancellation, the only one the customer has not heard about', () => {
    expect(
      appointmentEventPlan({
        kind: 'appointment.cancelled',
        cancelledBy: 'account',
        cancellationReason: null,
      }),
    ).toEqual({ notifyAccount: true, confirmCustomer: true });
  });

  it.each(['customer', 'ai'] as const)(
    'suppresses the duplicate confirmation for a %s cancellation',
    (cancelledBy) => {
      expect(
        appointmentEventPlan({
          kind: 'appointment.cancelled',
          cancelledBy,
          cancellationReason: 'ANULO',
        }),
      ).toEqual({
        notifyAccount: true,
        confirmCustomer: false,
        skipped: 'conversation_replied',
      });
    },
  );

  it('treats a missing actor as not PT-initiated', () => {
    expect(
      appointmentEventPlan({ kind: 'appointment.cancelled' }),
    ).toMatchObject({
      confirmCustomer: false,
      skipped: 'conversation_replied',
    });
  });

  it('does not let a customer reply spoof the erasure marker', () => {
    expect(
      appointmentEventPlan({
        kind: 'appointment.cancelled',
        cancelledBy: 'customer',
        cancellationReason: 'customer_erased',
      }),
    ).toMatchObject({ notifyAccount: true, skipped: 'conversation_replied' });
  });

  it('drops both the PT push and the customer confirmation for a GDPR erasure', () => {
    expect(
      appointmentEventPlan({
        kind: 'appointment.cancelled',
        cancelledBy: 'account',
        cancellationReason: 'customer_erased',
      }),
    ).toEqual({
      notifyAccount: false,
      confirmCustomer: false,
      skipped: 'customer_erased',
    });
  });

  // The turn that made the change already sent the customer this exact text, so
  // the background job is the second sender and must stay silent — the whole
  // point of routing on origin instead of guessing from timing.
  it.each(changeKinds)(
    'suppresses the confirmation for a conversation-originated %s',
    (kind) => {
      expect(
        appointmentEventPlan({
          kind,
          origin: 'conversation',
          cancelledBy: kind === 'appointment.cancelled' ? 'customer' : undefined,
        }),
      ).toEqual({
        notifyAccount: true,
        confirmCustomer: false,
        skipped: 'conversation_replied',
      });
    },
  );

  // Suppressing the customer confirmation must never suppress the PT's push:
  // she still has to see that her calendar moved.
  it.each(changeKinds)(
    'still pushes the PT for a conversation-originated %s',
    (kind) => {
      expect(
        appointmentEventPlan({ kind, origin: 'conversation' }).notifyAccount,
      ).toBe(true);
    },
  );

  it.each(changeKinds)('confirms a PT-originated %s immediately', (kind) => {
    expect(
      appointmentEventPlan({
        kind,
        origin: 'account',
        cancelledBy: kind === 'appointment.cancelled' ? 'account' : undefined,
      }),
    ).toEqual({ notifyAccount: true, confirmCustomer: true });
  });

  // A cancellation the AI made carries cancelledBy 'customer' in the reminder
  // fallback, so the actor alone cannot decide — the explicit origin outranks it.
  it('routes an AI cancellation recorded as customer-initiated by its origin', () => {
    expect(
      appointmentEventPlan({
        kind: 'appointment.cancelled',
        origin: 'conversation',
        cancelledBy: 'customer',
      }),
    ).toMatchObject({ confirmCustomer: false });
    expect(
      appointmentEventPlan({
        kind: 'appointment.cancelled',
        origin: 'account',
        cancelledBy: 'customer',
      }),
    ).toMatchObject({ confirmCustomer: true });
  });

  // Outbox rows written before `origin` existed must drain out behaving exactly
  // as they did: bookings and reschedules always confirmed, cancellations went
  // by actor.
  it.each(['appointment.booked', 'appointment.rescheduled'] as const)(
    'treats a %s with no origin as PT-initiated',
    (kind) => {
      expect(appointmentEventPlan({ kind })).toEqual({
        notifyAccount: true,
        confirmCustomer: true,
      });
      expect(appointmentEventPlan({ kind, origin: null })).toEqual({
        notifyAccount: true,
        confirmCustomer: true,
      });
    },
  );

  it('routes a cancellation with no origin by its actor', () => {
    expect(
      appointmentEventPlan({
        kind: 'appointment.cancelled',
        origin: null,
        cancelledBy: 'account',
      }),
    ).toEqual({ notifyAccount: true, confirmCustomer: true });
    expect(
      appointmentEventPlan({
        kind: 'appointment.cancelled',
        origin: null,
        cancelledBy: 'ai',
      }),
    ).toEqual({
      notifyAccount: true,
      confirmCustomer: false,
      skipped: 'conversation_replied',
    });
  });

  it.each(['conversation', 'account', null, undefined] as const)(
    'keeps a GDPR erasure fully silent with origin %s',
    (origin) => {
      expect(
        appointmentEventPlan({
          kind: 'appointment.cancelled',
          origin,
          cancelledBy: 'account',
          cancellationReason: 'customer_erased',
        }),
      ).toEqual({
        notifyAccount: false,
        confirmCustomer: false,
        skipped: 'customer_erased',
      });
    },
  );
});
