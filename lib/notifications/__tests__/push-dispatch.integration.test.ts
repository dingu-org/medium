import { randomUUID } from 'node:crypto';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, patients, pts } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';

const sendPush = vi.hoisted(() => vi.fn());
vi.mock('../push', () => ({ sendPush, vapidPublicKey: 'test-key' }));

import {
  NOTIFICATION_PREF_KEYS,
  type NotificationPrefs,
} from '@/app/(dashboard)/settings/constants';
import { dispatchPushForEvent } from '../push-dispatch';
import type { PushEvent } from '../push-payload';

let ptId = '';
let patientId = '';

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `push-dispatch-${Date.now()}@example.com`,
    password: 'push-dispatch-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
});

beforeEach(async () => {
  await db.delete(patients).where(eq(patients.ptId, ptId));
  await db
    .update(pts)
    .set({ timezone: 'Europe/Tirane', notificationPrefs: null })
    .where(eq(pts.id, ptId));
  const [patient] = await db
    .insert(patients)
    .values({
      ptId,
      name: 'Alex Patient',
      phone: '447700900500',
      waId: '447700900500',
    })
    .returning({ id: patients.id });
  patientId = patient.id;
  sendPush.mockReset();
  sendPush.mockResolvedValue({ sent: 1, removed: 0 });
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

function bookedEvent(): PushEvent {
  return {
    name: 'notification.requested',
    data: {
      ptId,
      kind: 'appointment.booked',
      appointmentId: randomUUID(),
      patientId,
      startsAt: new Date().toISOString(),
      previousStartsAt: null,
    },
  };
}

function revokedEvent(): PushEvent {
  return {
    name: 'wa.connection.revoked',
    data: { ptId, connectionId: randomUUID(), reason: 'unauthorized' },
  };
}

/**
 * One representative event per settings toggle, so we can exhaustively verify
 * that every pref gates its own event through the full DB-backed dispatch path
 * (not just the pure `pushPrefKey` mapping).
 */
function eventForPref(key: keyof NotificationPrefs): PushEvent {
  switch (key) {
    case 'booking':
      return bookedEvent();
    case 'cancellation':
      return {
        name: 'notification.requested',
        data: {
          ptId,
          kind: 'appointment.cancelled',
          appointmentId: randomUUID(),
          patientId,
          startsAt: new Date().toISOString(),
          previousStartsAt: null,
        },
      };
    case 'reschedule':
      return {
        name: 'notification.requested',
        data: {
          ptId,
          kind: 'appointment.rescheduled',
          appointmentId: randomUUID(),
          patientId,
          startsAt: new Date().toISOString(),
          previousStartsAt: new Date().toISOString(),
        },
      };
    case 'escalation':
      return {
        name: 'conversation.escalated',
        data: { ptId, conversationId: randomUUID(), patientId },
      };
    case 'resumeOffer':
      return {
        name: 'conversation.resume_offered',
        data: { ptId, conversationId: randomUUID(), patientId },
      };
    case 'connection':
      return revokedEvent();
    case 'reminderFailure':
      return {
        name: 'reminder.failed',
        data: { ptId, appointmentId: randomUUID(), reason: 'send_failed' },
      };
    case 'billing':
      return {
        name: 'billing.limit_reached',
        data: {
          ptId,
          kind: 'conversations',
          used: 30,
          limit: 30,
          monthKey: '2026-07',
        },
      };
  }
}

describe('dispatchPushForEvent', () => {
  it('sends when the category is enabled (defaults on)', async () => {
    const result = await dispatchPushForEvent(bookedEvent());
    expect(result).toEqual({ status: 'sent', sent: 1, removed: 0 });
    expect(sendPush).toHaveBeenCalledTimes(1);
    const [calledPtId, payload] = sendPush.mock.calls[0];
    expect(calledPtId).toBe(ptId);
    expect(payload.title).toBe('Rezervim i ri');
  });

  it('skips when the matching toggle is disabled', async () => {
    await db
      .update(pts)
      .set({ notificationPrefs: { booking: false } })
      .where(eq(pts.id, ptId));
    const result = await dispatchPushForEvent(bookedEvent());
    expect(result).toEqual({ status: 'skipped', reason: 'pref_disabled' });
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('gates the new connection toggle', async () => {
    await db
      .update(pts)
      .set({ notificationPrefs: { connection: false } })
      .where(eq(pts.id, ptId));
    expect(await dispatchPushForEvent(revokedEvent())).toEqual({
      status: 'skipped',
      reason: 'pref_disabled',
    });
    expect(sendPush).not.toHaveBeenCalled();
  });

  it('sends a revoked event to settings when enabled', async () => {
    expect(await dispatchPushForEvent(revokedEvent())).toEqual({
      status: 'sent',
      sent: 1,
      removed: 0,
    });
    expect(sendPush.mock.calls[0][1].url).toBe('/settings');
  });

  it('skips when the PT no longer exists', async () => {
    const result = await dispatchPushForEvent({
      name: 'notification.requested',
      data: {
        ptId: randomUUID(),
        kind: 'appointment.booked',
        appointmentId: randomUUID(),
        patientId,
        startsAt: new Date().toISOString(),
        previousStartsAt: null,
      },
    });
    expect(result).toEqual({ status: 'skipped', reason: 'pt_not_found' });
    expect(sendPush).not.toHaveBeenCalled();
  });

  // Every settings toggle must gate its own event end-to-end (DB-backed), not
  // just at the pure `pushPrefKey` level. Loops over all seven keys so a new
  // event/toggle can't silently ship ungated.
  describe.each(NOTIFICATION_PREF_KEYS)('pref "%s"', (key) => {
    it('sends when enabled by default', async () => {
      const result = await dispatchPushForEvent(eventForPref(key));
      expect(result).toEqual({ status: 'sent', sent: 1, removed: 0 });
      expect(sendPush).toHaveBeenCalledTimes(1);
    });

    it('skips when that toggle is off', async () => {
      await db
        .update(pts)
        .set({ notificationPrefs: { [key]: false } as NotificationPrefs })
        .where(eq(pts.id, ptId));
      const result = await dispatchPushForEvent(eventForPref(key));
      expect(result).toEqual({ status: 'skipped', reason: 'pref_disabled' });
      expect(sendPush).not.toHaveBeenCalled();
    });
  });

  it('propagates the fan-out counts and warns when every subscription is stale', async () => {
    sendPush.mockResolvedValue({ sent: 0, removed: 2 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = await dispatchPushForEvent(bookedEvent());
      expect(result).toEqual({ status: 'sent', sent: 0, removed: 2 });
      const line = warn.mock.calls
        .map((c) => c[0])
        .filter((a): a is string => typeof a === 'string')
        .map((a) => JSON.parse(a))
        .find((l) => l.event_name === 'push.dispatch_no_live_subscriptions');
      expect(line).toMatchObject({
        level: 'warn',
        event_name: 'push.dispatch_no_live_subscriptions',
        pt_id: ptId,
        source_event: 'notification.requested',
        removed: 2,
      });
    } finally {
      warn.mockRestore();
    }
  });

  it('does not warn when the PT simply has no subscriptions', async () => {
    sendPush.mockResolvedValue({ sent: 0, removed: 0 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = await dispatchPushForEvent(bookedEvent());
      expect(result).toEqual({ status: 'sent', sent: 0, removed: 0 });
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('records a push.dispatched event with counts after a dispatch', async () => {
    await db.delete(events).where(eq(events.ptId, ptId));
    sendPush.mockResolvedValue({ sent: 2, removed: 1 });
    const result = await dispatchPushForEvent(bookedEvent());
    expect(result).toEqual({ status: 'sent', sent: 2, removed: 1 });

    const rows = await db
      .select()
      .from(events)
      .where(and(eq(events.ptId, ptId), eq(events.type, 'push.dispatched')));
    expect(rows).toHaveLength(1);
    expect(rows[0].payload).toMatchObject({
      ptId,
      sourceEvent: 'notification.requested',
      sent: 2,
      removed: 1,
    });
  });

  it('swallows a metric-recording failure without failing the dispatch', async () => {
    const txSpy = vi
      .spyOn(db, 'transaction')
      .mockRejectedValueOnce(new Error('boom') as never);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = await dispatchPushForEvent(bookedEvent());
      expect(result).toEqual({ status: 'sent', sent: 1, removed: 0 });
      const recordFailed = warn.mock.calls
        .map((c) => c[0])
        .filter((a): a is string => typeof a === 'string')
        .map((a) => JSON.parse(a))
        .find((l) => l.event_name === 'push.dispatched_record_failed');
      expect(recordFailed).toMatchObject({
        level: 'warn',
        event_name: 'push.dispatched_record_failed',
        pt_id: ptId,
      });
    } finally {
      warn.mockRestore();
      txSpy.mockRestore();
    }
  });
});
