import { and, eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/lib/db';
import { events, pushSubscriptions } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import {
  isEndpointOwned,
  removePushSubscription,
  savePushSubscription,
} from '../push-actions';
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
let otherPtId = '';

beforeAll(async () => {
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: `push-actions-${Date.now()}@example.com`,
    password: 'push-actions-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
  authState.userId = ptId;

  const other = await supabase.auth.admin.createUser({
    email: `push-actions-other-${Date.now()}@example.com`,
    password: 'push-actions-pass-1234',
    email_confirm: true,
  });
  if (other.error || !other.data.user) throw new Error(other.error?.message);
  otherPtId = other.data.user.id;
});

beforeEach(async () => {
  authState.userId = ptId;
  await db
    .delete(pushSubscriptions)
    .where(inArray(pushSubscriptions.ptId, [ptId, otherPtId]));
  await db.delete(events).where(inArray(events.ptId, [ptId, otherPtId]));
});

afterAll(async () => {
  const supabase = createServiceClient();
  if (ptId) await supabase.auth.admin.deleteUser(ptId);
  if (otherPtId) await supabase.auth.admin.deleteUser(otherPtId);
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

describe('isEndpointOwned', () => {
  it('is true only for the caller, so a rotated or pruned endpoint is detectable', async () => {
    await savePushSubscription({
      endpoint: 'https://push.example.com/owned',
      keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
    });

    await expect(
      isEndpointOwned('https://push.example.com/owned'),
    ).resolves.toBe(true);
    // The endpoint the browser rotated to (or that a 410 pruned) is unknown.
    await expect(
      isEndpointOwned('https://push.example.com/rotated'),
    ).resolves.toBe(false);
  });

  it('is false for an endpoint stored against another pt', async () => {
    await db.insert(pushSubscriptions).values({
      ptId: otherPtId,
      endpoint: 'https://push.example.com/other-pt',
      keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
    });

    await expect(
      isEndpointOwned('https://push.example.com/other-pt'),
    ).resolves.toBe(false);
  });
});

describe('removePushSubscription', () => {
  it('deletes only the caller row for that endpoint', async () => {
    await savePushSubscription({
      endpoint: 'https://push.example.com/mine',
      keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
    });
    await db.insert(pushSubscriptions).values({
      ptId: otherPtId,
      endpoint: 'https://push.example.com/theirs',
      keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
    });

    await removePushSubscription('https://push.example.com/mine');

    const mine = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.ptId, ptId));
    expect(mine).toHaveLength(0);

    const theirs = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.ptId, otherPtId));
    expect(theirs).toHaveLength(1);
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
