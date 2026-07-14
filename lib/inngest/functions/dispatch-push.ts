import { inngest } from '@/lib/inngest/client';
import { dispatchPushForEvent } from '@/lib/notifications/push-dispatch';
import type { PushEvent } from '@/lib/notifications/push-payload';

/**
 * Single subscriber that turns PT-facing domain events into Web Push
 * notifications. `notification.requested` already carries resolved appointment
 * fields; the other four events flow through the durable outbox with no other
 * subscriber. Idempotent on the source event id so Inngest retries don't
 * double-send.
 */
export const dispatchPushNotification = inngest.createFunction(
  { id: 'dispatch-push-notification', retries: 2, idempotency: 'event.id' },
  [
    { event: 'notification.requested' },
    { event: 'conversation.escalated' },
    { event: 'conversation.resume_offered' },
    { event: 'wa.connection.revoked' },
    { event: 'reminder.failed' },
    { event: 'billing.limit_warning' },
    { event: 'billing.limit_reached' },
  ],
  async ({ event, step }) => {
    if (!event.id) throw new Error('Push event ID is required');
    // The dispatch result ({status, sent, removed} | {status:'skipped', reason})
    // is returned as the step output, so Inngest's run history records exactly
    // how many browsers each event reached — the delivery signal Phase 11 reads.
    return step.run('dispatch-push', () =>
      dispatchPushForEvent({
        name: event.name,
        data: event.data,
      } as PushEvent),
    );
  },
);
