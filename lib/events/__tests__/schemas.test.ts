import { describe, expect, it } from 'vitest';
import { backgroundEventSchemas } from '@/lib/events/background';
import { appointmentEventSchemas } from '@/lib/events/appointments';

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';

describe('backgroundEventSchemas — Phase 11 additions', () => {
  it('validates a push.dispatched counts payload', () => {
    const parsed = backgroundEventSchemas['push.dispatched'].parse({
      accountId: UUID,
      sourceEvent: 'notification.requested',
      sent: 2,
      removed: 1,
    });
    expect(parsed).toMatchObject({ sent: 2, removed: 1 });
  });

  it('rejects negative push.dispatched counts', () => {
    expect(
      backgroundEventSchemas['push.dispatched'].safeParse({
        accountId: UUID,
        sourceEvent: 'x',
        sent: -1,
        removed: 0,
      }).success,
    ).toBe(false);
  });

  it('validates the pwa.installed and push.subscribed producer payloads', () => {
    expect(
      backgroundEventSchemas['pwa.installed'].parse({ accountId: UUID }),
    ).toEqual({ accountId: UUID });
    expect(
      backgroundEventSchemas['push.subscribed'].parse({ accountId: UUID }),
    ).toEqual({ accountId: UUID });
  });

  it('preserves an optional traceId on an existing event', () => {
    const parsed = backgroundEventSchemas['message.received'].parse({
      messageId: UUID,
      accountId: UUID,
      conversationId: UUID2,
      traceId: UUID,
    });
    expect(parsed.traceId).toBe(UUID);
  });

  it('strips undeclared keys (why traceId must be declared)', () => {
    const parsed = backgroundEventSchemas['message.received'].parse({
      messageId: UUID,
      accountId: UUID,
      conversationId: UUID2,
      undeclared: 'x',
    }) as Record<string, unknown>;
    expect(parsed).not.toHaveProperty('undeclared');
    expect(parsed.traceId).toBeUndefined();
  });
});

describe('appointmentEventSchemas — traceId', () => {
  it('accepts an optional traceId on the appointment summary', () => {
    const parsed = appointmentEventSchemas['appointment.booked'].parse({
      accountId: UUID,
      appointmentId: UUID,
      customerId: UUID2,
      startsAt: '2026-06-15T10:00:00.000Z',
      endsAt: '2026-06-15T11:00:00.000Z',
      serviceType: null,
      status: 'pending',
      traceId: UUID,
    });
    expect(parsed.traceId).toBe(UUID);
  });
});
