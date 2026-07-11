import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { events, pushSubscriptions } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { savePushSubscription } from '../push-actions';
import { recordPwaInstalled } from '../../pwa-install-actions';

const authState = vi.hoisted(() => ({ userId: '' }));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({
  createServerClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: authState.userId } } }),
    },
  }),
}));

let ptId = '';

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `push-actions-${Date.now()}@example.com`,
    password: 'push-actions-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
  authState.userId = ptId;
});

beforeEach(async () => {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.ptId, ptId));
  await db.delete(events).where(eq(events.ptId, ptId));
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

describe('savePushSubscription', () => {
  it('persists the subscription and records a push.subscribed event', async () => {
    const result = await savePushSubscription({
      endpoint: 'https://push.example.com/abc123',
      keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
    });
    expect(result).toEqual({ ok: true });

    const [row] = await db
      .select({ endpoint: pushSubscriptions.endpoint })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.ptId, ptId));
    expect(row?.endpoint).toBe('https://push.example.com/abc123');

    const [event] = await db
      .select({ payload: events.payload })
      .from(events)
      .where(and(eq(events.ptId, ptId), eq(events.type, 'push.subscribed')));
    expect(event?.payload).toMatchObject({ ptId });
  });
});

describe('recordPwaInstalled', () => {
  it('records a pwa.installed event', async () => {
    await recordPwaInstalled();

    const [event] = await db
      .select({ payload: events.payload })
      .from(events)
      .where(and(eq(events.ptId, ptId), eq(events.type, 'pwa.installed')));
    expect(event?.payload).toMatchObject({ ptId });
  });
});
