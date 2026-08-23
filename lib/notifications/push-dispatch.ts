import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { customers, accounts } from '@/lib/db/schema';
import { appendBackgroundEvent } from '@/lib/events/background';
import { privacyName } from '@/lib/format/name';
import { logger, serializeError } from '@/lib/log';
import { resolveNotificationPrefs } from '@/lib/pwa/read-models';
import { buildPushPayload, pushPrefKey, type PushEvent } from './push-payload';
import { sendPush } from './push';

export type DispatchResult =
  | { status: 'sent'; sent: number; removed: number }
  | {
      status: 'skipped';
      reason: 'pt_not_found' | 'pref_disabled' | 'no_payload';
    };

/**
 * Resolve the PT's preferences + customer name, build the push payload, and fan
 * it out. Pure enough to test directly without the Inngest runtime.
 */
export async function dispatchPushForEvent(
  event: PushEvent,
): Promise<DispatchResult> {
  const { accountId } = event.data;

  const [account] = await db
    .select({
      timezone: accounts.timezone,
      notificationPrefs: accounts.notificationPrefs,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  if (!account) return { status: 'skipped', reason: 'pt_not_found' };

  const prefs = resolveNotificationPrefs(account.notificationPrefs);
  if (!prefs[pushPrefKey(event)]) {
    return { status: 'skipped', reason: 'pref_disabled' };
  }

  const customerId =
    'customerId' in event.data ? event.data.customerId : undefined;
  let customerName: string | undefined;
  if (customerId) {
    const [customer] = await db
      .select({ name: customers.name })
      .from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.accountId, accountId)))
      .limit(1);
    if (customer) customerName = privacyName(customer.name);
  }

  const payload = buildPushPayload(event, {
    customerName,
    timezone: account.timezone ?? 'Europe/Berlin',
  });
  if (!payload) return { status: 'skipped', reason: 'no_payload' };

  const { sent, removed } = await sendPush(accountId, payload);

  // Persist a counts-only `push.dispatched` event so Phase 11 delivery-rate
  // metrics can see silent Web Push churn. No Inngest consumer — the outbox row
  // just drains. Recording must NEVER fail a real dispatch, so swallow errors.
  try {
    await db.transaction((tx) =>
      appendBackgroundEvent(tx, {
        type: 'push.dispatched',
        data: { accountId, sourceEvent: event.name, sent, removed },
      }),
    );
  } catch (error) {
    logger.warn(
      'push.dispatched_record_failed',
      'Failed to record push.dispatched metric event',
      { account_id: accountId, source_event: event.name, ...serializeError(error) },
    );
  }

  // A dispatch where every subscription turned out stale (removed>0, sent===0)
  // means we believed we could reach this PT but couldn't — worth a structured
  // warn. sent===0 with no removals is just a PT who hasn't enabled push yet.
  if (sent === 0 && removed > 0) {
    logger.warn(
      'push.dispatch_no_live_subscriptions',
      'Push dispatch reached no live subscriptions',
      { account_id: accountId, source_event: event.name, removed },
    );
  }
  return { status: 'sent', sent, removed };
}
