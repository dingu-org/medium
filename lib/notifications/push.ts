import { eq } from 'drizzle-orm';
import * as webpush from 'web-push';
import { db } from '@/lib/db';
import { pushSubscriptions } from '@/lib/db/schema';
import { logger, serializeError } from '@/lib/log';

// Throw at construction (repo convention). The VAPID keypair is generated once
// in Phase 0 and must never be regenerated — doing so invalidates every
// existing browser subscription.
const subject = process.env.VAPID_SUBJECT;
const publicKey = process.env.VAPID_PUBLIC_KEY;
const privateKey = process.env.VAPID_PRIVATE_KEY;
if (!subject || !publicKey || !privateKey) {
  throw new Error(
    'VAPID_SUBJECT, VAPID_PUBLIC_KEY, and VAPID_PRIVATE_KEY are required',
  );
}
webpush.setVapidDetails(subject, publicKey, privateKey);

/** The public VAPID key (safe to expose to the browser). */
export const vapidPublicKey = publicKey;

export type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
};

type SubscriptionKeys = { p256dh: string; auth: string };

/**
 * Fan a push notification out to every browser the PT has subscribed. Dead
 * subscriptions (404/410 from the push service) are deleted; other failures are
 * logged and left in place, since they may be transient. Never logs endpoint
 * URLs or subscription keys.
 */
export async function sendPush(
  accountId: string,
  payload: PushPayload,
): Promise<{ sent: number; removed: number }> {
  const rows = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      keys: pushSubscriptions.keys,
    })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.accountId, accountId));

  if (rows.length === 0) return { sent: 0, removed: 0 };

  const body = JSON.stringify(payload);

  const outcomes = await Promise.allSettled(
    rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: row.keys as SubscriptionKeys },
          body,
        );
        return 'sent' as const;
      } catch (error) {
        const statusCode =
          error instanceof webpush.WebPushError ? error.statusCode : undefined;
        if (statusCode === 404 || statusCode === 410) {
          await db
            .delete(pushSubscriptions)
            .where(eq(pushSubscriptions.id, row.id));
          return 'removed' as const;
        }
        logger.warn('push.send_failed', 'Web push send failed', {
          account_id: accountId,
          subscription_id: row.id,
          status_code: statusCode,
          ...serializeError(error),
        });
        return 'failed' as const;
      }
    }),
  );

  let sent = 0;
  let removed = 0;
  for (const outcome of outcomes) {
    if (outcome.status !== 'fulfilled') continue;
    if (outcome.value === 'sent') sent++;
    else if (outcome.value === 'removed') removed++;
  }
  return { sent, removed };
}
