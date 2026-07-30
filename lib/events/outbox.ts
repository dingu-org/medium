import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { eventOutbox } from '@/lib/db/schema';
import { appointmentEventSchemas } from '@/lib/events/appointments';
import { backgroundEventSchemas } from '@/lib/events/background';
import { inngest } from '@/lib/inngest/client';
import { logger, serializeError } from '@/lib/log';

const LEASE_MINUTES = 5;
const MAX_BACKOFF_MINUTES = 60;
// Attempts before a row that keeps failing to reach Inngest is given up on.
// With the capped backoff that is ~a day of retrying, so a long Inngest outage
// still drains once it ends; past that the row is poison, and retrying it
// forever only buries the log in the same failure every minute.
export const MAX_PUBLISH_ATTEMPTS = 25;

type OutboxRow = {
  id: string;
  ptId: string;
  eventId: string;
  eventType: string;
  payload: unknown;
  attempts: number;
};

// Inngest consumers treat the event name and payload as trusted input, so the
// publisher is the trust boundary between the `event_outbox` table and the job
// runner: only names we actually emit are forwarded, and the payload must carry
// the outbox row's own pt_id (every schema in the two maps requires ptId, and
// appendStoredEvent derives the row's pt_id from it). A row failing either check
// can never be published, so it is stamped published so it drains instead of
// being reclaimed and retried forever.
const KNOWN_EVENT_TYPES = new Set<string>([
  ...Object.keys(backgroundEventSchemas),
  ...Object.keys(appointmentEventSchemas),
]);

function rejectionReason(row: OutboxRow): string | null {
  if (!KNOWN_EVENT_TYPES.has(row.eventType)) return 'unknown_event_type';
  const payload = row.payload;
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload))
    return 'payload_not_object';
  if ((payload as { ptId?: unknown }).ptId !== row.ptId)
    return 'payload_pt_id_mismatch';
  return null;
}

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
      outbox.pt_id AS "ptId",
      outbox.event_id AS "eventId",
      outbox.event_type AS "eventType",
      outbox.payload,
      outbox.attempts
  `);
}

/**
 * What became of one claimed row. `rejected` (a forgery the publisher refused)
 * and `dead_letter` (a row that will never reach Inngest) are drained states,
 * NOT transport failures: lumping them into one `failed` count made a healthy
 * run that dropped a forged row look exactly like Inngest being down.
 */
export type PublishOutcome =
  | 'published'
  | 'rejected'
  | 'failed'
  | 'dead_letter';

async function publishClaimed(
  row: OutboxRow,
  sendEvent: SendEvent = inngest.send.bind(inngest),
): Promise<PublishOutcome> {
  const rejected = rejectionReason(row);
  if (rejected) {
    await db
      .update(eventOutbox)
      .set({
        publishedAt: new Date(),
        lockedAt: null,
        lastError: `rejected: ${rejected}`,
      })
      .where(
        and(
          eq(eventOutbox.id, row.id),
          sql`${eventOutbox.publishedAt} IS NULL`,
        ),
      );

    logger.warn(
      'outbox.publish_rejected',
      'Outbox event rejected unpublished',
      {
        event_id: row.eventId,
        outbox_event_type: row.eventType,
        reason: rejected,
      },
    );
    return 'rejected';
  }

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
    return 'published';
  } catch (error) {
    const exhausted = row.attempts >= MAX_PUBLISH_ATTEMPTS;
    await db
      .update(eventOutbox)
      .set({
        ...(exhausted
          ? { publishedAt: new Date() }
          : {
              availableAt: new Date(
                Date.now() + backoffMinutes(row.attempts) * 60_000,
              ),
            }),
        lockedAt: null,
        lastError: `${exhausted ? 'dead_letter: ' : ''}${sanitizedError(error)}`,
      })
      .where(eq(eventOutbox.id, row.id));

    if (exhausted) {
      logger.error(
        'outbox.publish_dead_lettered',
        'Outbox event abandoned after exhausting publish attempts',
        {
          event_id: row.eventId,
          outbox_event_type: row.eventType,
          attempts: row.attempts,
          ...serializeError(error),
        },
      );
      return 'dead_letter';
    }

    logger.warn('outbox.publish_failed', 'Outbox event publish failed', {
      event_id: row.eventId,
      outbox_event_type: row.eventType,
      attempts: row.attempts,
      ...serializeError(error),
    });
    return 'failed';
  }
}

export async function publishOutboxEvent(
  eventId: string,
): Promise<{ published: boolean; claimed: boolean }> {
  const [row] = await claimOutboxRows({ eventId, limit: 1 });
  if (!row) return { published: false, claimed: false };
  return { published: (await publishClaimed(row)) === 'published', claimed: true };
}

export async function tryPublishOutboxEvent(eventId: string): Promise<void> {
  try {
    await publishOutboxEvent(eventId);
  } catch (error) {
    logger.warn(
      'outbox.immediate_publish_unavailable',
      'Immediate outbox publish unavailable',
      { event_id: eventId, ...serializeError(error) },
    );
  }
}

export async function publishDueOutboxEvents(limit = 50): Promise<{
  claimed: number;
  published: number;
  /** Transport failures only — the count that means "Inngest is unreachable". */
  failed: number;
  /** Refused by the publisher's trust check (forged type/tenant). */
  rejected: number;
  /** Gave up after MAX_PUBLISH_ATTEMPTS. */
  deadLettered: number;
}> {
  const rows = await claimOutboxRows({ limit });
  const tally = { published: 0, failed: 0, rejected: 0, deadLettered: 0 };
  for (const row of rows) {
    const outcome = await publishClaimed(row);
    if (outcome === 'published') tally.published++;
    else if (outcome === 'rejected') tally.rejected++;
    else if (outcome === 'dead_letter') tally.deadLettered++;
    else tally.failed++;
  }
  return { claimed: rows.length, ...tally };
}
