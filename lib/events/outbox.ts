import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eventOutbox } from '@/lib/db/schema';
import { inngest } from '@/lib/inngest/client';

const LEASE_MINUTES = 5;
const MAX_BACKOFF_MINUTES = 60;

type OutboxRow = {
  id: string;
  eventId: string;
  eventType: string;
  payload: unknown;
  attempts: number;
};

type SendEvent = typeof inngest.send;

function sanitizedError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/\s+/g, ' ').slice(0, 500);
}

function backoffMinutes(attempts: number): number {
  return Math.min(MAX_BACKOFF_MINUTES, 2 ** Math.max(0, attempts - 1));
}

async function claimOutboxRows(args: {
  eventId?: string;
  limit: number;
}): Promise<OutboxRow[]> {
  const eventFilter = args.eventId
    ? sql`AND event_id = ${args.eventId}`
    : sql``;

  return db.execute<OutboxRow>(sql`
    WITH candidates AS (
      SELECT id
      FROM event_outbox
      WHERE published_at IS NULL
        AND available_at <= now()
        AND (
          locked_at IS NULL
          OR locked_at < now() - (${LEASE_MINUTES} * interval '1 minute')
        )
        ${eventFilter}
      ORDER BY available_at, created_at
      LIMIT ${args.limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE event_outbox AS outbox
    SET
      locked_at = now(),
      attempts = outbox.attempts + 1
    FROM candidates
    WHERE outbox.id = candidates.id
    RETURNING
      outbox.id,
      outbox.event_id AS "eventId",
      outbox.event_type AS "eventType",
      outbox.payload,
      outbox.attempts
  `);
}

async function publishClaimed(
  row: OutboxRow,
  sendEvent: SendEvent = inngest.send.bind(inngest),
): Promise<boolean> {
  try {
    await sendEvent({
      id: row.eventId,
      name: row.eventType,
      data: row.payload,
    } as Parameters<SendEvent>[0]);

    await db
      .update(eventOutbox)
      .set({
        publishedAt: new Date(),
        lockedAt: null,
        lastError: null,
      })
      .where(
        and(
          eq(eventOutbox.id, row.id),
          sql`${eventOutbox.publishedAt} IS NULL`,
        ),
      );
    return true;
  } catch (error) {
    await db
      .update(eventOutbox)
      .set({
        availableAt: new Date(
          Date.now() + backoffMinutes(row.attempts) * 60_000,
        ),
        lockedAt: null,
        lastError: sanitizedError(error),
      })
      .where(eq(eventOutbox.id, row.id));

    console.warn('[event-outbox] publish failed', {
      eventId: row.eventId,
      eventType: row.eventType,
      attempts: row.attempts,
      errorName: error instanceof Error ? error.name : typeof error,
    });
    return false;
  }
}

export async function publishOutboxEvent(
  eventId: string,
): Promise<{ published: boolean; claimed: boolean }> {
  const [row] = await claimOutboxRows({ eventId, limit: 1 });
  if (!row) return { published: false, claimed: false };
  return { published: await publishClaimed(row), claimed: true };
}

export async function tryPublishOutboxEvent(eventId: string): Promise<void> {
  try {
    await publishOutboxEvent(eventId);
  } catch (error) {
    console.warn('[event-outbox] immediate publish unavailable', {
      eventId,
      errorName: error instanceof Error ? error.name : typeof error,
    });
  }
}

export async function publishDueOutboxEvents(
  limit = 50,
): Promise<{ claimed: number; published: number; failed: number }> {
  const rows = await claimOutboxRows({ limit });
  let published = 0;
  for (const row of rows) {
    if (await publishClaimed(row)) published++;
  }
  return {
    claimed: rows.length,
    published,
    failed: rows.length - published,
  };
}
