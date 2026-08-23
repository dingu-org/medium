import { and, count, desc, eq, gt, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, customers, accounts } from '@/lib/db/schema';
import { privacyName } from '@/lib/format/name';
import {
  formatNotification,
  NOTIFICATION_TYPES,
  type NotificationView,
} from './format';

const FEED_LIMIT = 30;

export type NotificationData = {
  items: NotificationView[];
  unreadCount: number;
};

export async function getNotificationData(
  accountId: string,
): Promise<NotificationData> {
  const [account] = await db
    .select({
      timezone: accounts.timezone,
      seenAt: accounts.notificationsSeenAt,
    })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);

  const timezone = account?.timezone ?? 'Europe/Berlin';
  const seenAt = account?.seenAt ?? null;

  const rows = await db
    .select({
      id: events.id,
      type: events.type,
      payload: events.payload,
      occurredAt: events.occurredAt,
    })
    .from(events)
    .where(
      and(
        eq(events.accountId, accountId),
        inArray(events.type, [...NOTIFICATION_TYPES]),
      ),
    )
    .orderBy(desc(events.occurredAt))
    .limit(FEED_LIMIT);

  // Unread count is computed across all notification events, not just the feed
  // window, so the badge stays accurate when there are more than FEED_LIMIT.
  const [{ value: unreadCount } = { value: 0 }] = await db
    .select({ value: count() })
    .from(events)
    .where(
      and(
        eq(events.accountId, accountId),
        inArray(events.type, [...NOTIFICATION_TYPES]),
        seenAt ? gt(events.occurredAt, seenAt) : undefined,
      ),
    );

  // Enrich with customer names (privacy-trimmed) via a single lookup.
  const customerIds = [
    ...new Set(
      rows
        .map((r) => {
          const payload = r.payload as Record<string, unknown>;
          return typeof payload.customerId === 'string'
            ? payload.customerId
            : null;
        })
        .filter((v): v is string => v !== null),
    ),
  ];

  const nameById = new Map<string, string>();
  if (customerIds.length > 0) {
    const customerRows = await db
      .select({ id: customers.id, name: customers.name })
      .from(customers)
      .where(
        and(eq(customers.accountId, accountId), inArray(customers.id, customerIds)),
      );
    for (const p of customerRows) nameById.set(p.id, privacyName(p.name));
  }

  const items = rows.map((r) => {
    const payload = r.payload as Record<string, unknown>;
    const customerId =
      typeof payload.customerId === 'string' ? payload.customerId : undefined;
    return formatNotification(
      {
        id: r.id,
        type: r.type,
        payload,
        occurredAt: r.occurredAt.toISOString(),
      },
      { timezone, customerName: customerId ? nameById.get(customerId) : undefined },
    );
  });

  return { items, unreadCount: Number(unreadCount) };
}
