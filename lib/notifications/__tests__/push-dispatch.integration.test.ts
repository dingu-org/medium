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
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { patients, pts } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';

const sendPush = vi.hoisted(() => vi.fn());
vi.mock('../push', () => ({ sendPush, vapidPublicKey: 'test-key' }));

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

describe('dispatchPushForEvent', () => {
  it('sends when the category is enabled (defaults on)', async () => {
    const result = await dispatchPushForEvent(bookedEvent());
    expect(result).toEqual({ status: 'sent' });
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
});
