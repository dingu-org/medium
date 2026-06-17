import { and, count, desc, eq, gt, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { events, patients, pts } from '@/lib/db/schema';
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
  ptId: string,
): Promise<NotificationData> {
  const [pt] = await db
    .select({
      timezone: pts.timezone,
      seenAt: pts.notificationsSeenAt,
    })
    .from(pts)
    .where(eq(pts.id, ptId))
    .limit(1);

  const timezone = pt?.timezone ?? 'Europe/Berlin';
  const seenAt = pt?.seenAt ?? null;

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
        eq(events.ptId, ptId),
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
        eq(events.ptId, ptId),
        inArray(events.type, [...NOTIFICATION_TYPES]),
        seenAt ? gt(events.occurredAt, seenAt) : undefined,
      ),
    );

  // Enrich with patient names (privacy-trimmed) via a single lookup.
  const patientIds = [
    ...new Set(
      rows
        .map((r) => {
          const payload = r.payload as Record<string, unknown>;
          return typeof payload.patientId === 'string'
            ? payload.patientId
            : null;
        })
        .filter((v): v is string => v !== null),
    ),
  ];

  const nameById = new Map<string, string>();
  if (patientIds.length > 0) {
    const patientRows = await db
      .select({ id: patients.id, name: patients.name })
      .from(patients)
      .where(
        and(eq(patients.ptId, ptId), inArray(patients.id, patientIds)),
      );
    for (const p of patientRows) nameById.set(p.id, privacyName(p.name));
  }

  const items = rows.map((r) => {
    const payload = r.payload as Record<string, unknown>;
    const patientId =
      typeof payload.patientId === 'string' ? payload.patientId : undefined;
    return formatNotification(
      {
        id: r.id,
        type: r.type,
        payload,
        occurredAt: r.occurredAt.toISOString(),
      },
      { timezone, patientName: patientId ? nameById.get(patientId) : undefined },
    );
  });

  return { items, unreadCount: Number(unreadCount) };
}
