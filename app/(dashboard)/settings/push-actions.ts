'use server';

import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '@/lib/db';
import { pushSubscriptions } from '@/lib/db/schema';
import { vapidPublicKey } from '@/lib/notifications/push';
import { createServerClient } from '@/lib/supabase/server';

/** The public VAPID key the browser needs to build `applicationServerKey`. */
export async function getVapidPublicKey(): Promise<string> {
  return vapidPublicKey;
}

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
export async function savePushSubscription(
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
      ptId: user.id,
      endpoint: parsed.data.endpoint,
      keys: parsed.data.keys,
      userAgent: userAgent ?? null,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        ptId: user.id,
        keys: parsed.data.keys,
        userAgent: userAgent ?? null,
      },
    });

  return { ok: true };
}

/** Remove this browser's subscription (called on disable / unsubscribe). */
export async function removePushSubscription(endpoint: string): Promise<void> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.ptId, user.id),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    );
}
