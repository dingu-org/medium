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

let accountId = '';
let otherAccountId = '';

beforeAll(async () => {
  const supabase = createServiceClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email: `push-actions-${Date.now()}@example.com`,
    password: 'push-actions-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  accountId = data.user.id;
  authState.userId = accountId;

  const other = await supabase.auth.admin.createUser({
    email: `push-actions-other-${Date.now()}@example.com`,
    password: 'push-actions-pass-1234',
    email_confirm: true,
  });
  if (other.error || !other.data.user) throw new Error(other.error?.message);
  otherAccountId = other.data.user.id;
});

beforeEach(async () => {
  authState.userId = accountId;
  await db
    .delete(pushSubscriptions)
    .where(inArray(pushSubscriptions.accountId, [accountId, otherAccountId]));
  await db.delete(events).where(inArray(events.accountId, [accountId, otherAccountId]));
});

afterAll(async () => {
  const supabase = createServiceClient();
  if (accountId) await supabase.auth.admin.deleteUser(accountId);
  if (otherAccountId) await supabase.auth.admin.deleteUser(otherAccountId);
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
      .where(eq(pushSubscriptions.accountId, accountId));
    expect(row?.endpoint).toBe('https://push.example.com/abc123');

    const [event] = await db
      .select({ payload: events.payload })
      .from(events)
      .where(and(eq(events.accountId, accountId), eq(events.type, 'push.subscribed')));
    expect(event?.payload).toMatchObject({ accountId });
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

  it('is false for an endpoint stored against another account', async () => {
    await db.insert(pushSubscriptions).values({
      accountId: otherAccountId,
      endpoint: 'https://push.example.com/other-account',
      keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
    });

    await expect(
      isEndpointOwned('https://push.example.com/other-account'),
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
      accountId: otherAccountId,
      endpoint: 'https://push.example.com/theirs',
      keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
    });

    await removePushSubscription('https://push.example.com/mine');

    const mine = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.accountId, accountId));
    expect(mine).toHaveLength(0);

    const theirs = await db
      .select({ id: pushSubscriptions.id })
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.accountId, otherAccountId));
    expect(theirs).toHaveLength(1);
  });
});

describe('recordPwaInstalled', () => {
  it('records a pwa.installed event', async () => {
    await recordPwaInstalled();

    const [event] = await db
      .select({ payload: events.payload })
      .from(events)
      .where(and(eq(events.accountId, accountId), eq(events.type, 'pwa.installed')));
    expect(event?.payload).toMatchObject({ accountId });
  });
});
