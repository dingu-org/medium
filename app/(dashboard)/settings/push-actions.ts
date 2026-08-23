'use server';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { pushSubscriptions } from '@/lib/db/schema';
import { appendBackgroundEvent } from '@/lib/events/background';
import { vapidPublicKey } from '@/lib/notifications/push';
import { instrumentedAction } from '@/lib/actions/instrument';
import { createServerClient } from '@/lib/supabase/server';

/** The public VAPID key the browser needs to build `applicationServerKey`. */
async function getVapidPublicKeyImpl(): Promise<string> {
  return vapidPublicKey;
}

export const getVapidPublicKey = instrumentedAction(
  'push.getVapidPublicKey',
  getVapidPublicKeyImpl,
);

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/**
 * Persist (or refresh) the browser's push subscription for the current PT.
 * Upserts on `endpoint` so re-subscribing the same browser updates rather than
 * duplicates.
 */
async function savePushSubscriptionImpl(
  input: unknown,
  userAgent?: string,
): Promise<{ ok: boolean }> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };

  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  await db
    .insert(pushSubscriptions)
    .values({
      accountId: user.id,
      endpoint: parsed.data.endpoint,
      keys: parsed.data.keys,
      userAgent: userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        accountId: user.id,
        keys: parsed.data.keys,
        userAgent: userAgent ?? null,
      },
    });

  // Best-effort funnel metric: a save failure must never fail the real
  // subscription write above. No consumer listens for this event — the
  // outbox row it also produces just drains with no matching trigger.
  try {
    await db.transaction((tx) =>
      appendBackgroundEvent(tx, {
        type: 'push.subscribed',
        data: { accountId: user.id },
      }),
    );
  } catch {
    // swallow
  }

  return { ok: true };
}

export const savePushSubscription = instrumentedAction(
  'push.savePushSubscription',
  savePushSubscriptionImpl,
);

/**
 * Whether this endpoint is stored for the *current* PT. The browser owning a
 * subscription proves nothing server-side: the row may have been pruned after a
 * 410, or the endpoint may still map to a PT who signed out on this device.
 */
async function isEndpointOwnedImpl(endpoint: string): Promise<boolean> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const [row] = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.accountId, user.id),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export const isEndpointOwned = instrumentedAction(
  'push.isEndpointOwned',
  isEndpointOwnedImpl,
);

/** Remove this browser's subscription (called on disable / unsubscribe). */
async function removePushSubscriptionImpl(endpoint: string): Promise<void> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.accountId, user.id),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    );
}

export const removePushSubscription = instrumentedAction(
  'push.removePushSubscription',
  removePushSubscriptionImpl,
);
