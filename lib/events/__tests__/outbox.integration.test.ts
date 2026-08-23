import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { db } from '@/lib/db';
import { eventOutbox, events } from '@/lib/db/schema';
import {
  MAX_PUBLISH_ATTEMPTS,
  publishDueOutboxEvents,
  publishOutboxEvent,
} from '@/lib/events/outbox';
import { inngest } from '@/lib/inngest/client';
import { createServiceClient } from '@/lib/supabase/service';
import { excludeForeignRows } from '@/tests/support/isolation';

let accountId = '';

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `outbox-${Date.now()}@example.com`,
    password: 'outbox-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(`createUser failed: ${error?.message}`);
  accountId = data.user.id;
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

beforeEach(async () => {
  await db.delete(eventOutbox).where(eq(eventOutbox.accountId, accountId));
  await db.delete(events).where(eq(events.accountId, accountId));
  // The tallies below are absolute (`claimed: 2`), and the publisher claims
  // across every tenant, so any other suite's still-due row would be counted
  // here. Park the foreign rows as published so the scan only sees this file's.
  await excludeForeignRows(eventOutbox, accountId, { publishedAt: new Date() });
  vi.spyOn(inngest, 'send').mockResolvedValue({ ids: [] } as never);
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * Write the pair appendStoredEvent writes, but with an arbitrary event_type and
 * payload — the shape a tenant could forge while `event_outbox` was writable.
 */
async function seedOutboxRow(args: {
  eventType: string;
  payload: unknown;
}): Promise<{ eventId: string; outboxId: string }> {
  const [event] = await db
    .insert(events)
    .values({ accountId, type: args.eventType, payload: args.payload })
    .returning({ id: events.id });
  const [row] = await db
    .insert(eventOutbox)
    .values({
      accountId,
      eventId: event.id,
      eventType: args.eventType,
      payload: args.payload,
    })
    .returning({ id: eventOutbox.id });
  return { eventId: event.id, outboxId: row.id };
}

async function outboxRow(id: string) {
  const [row] = await db
    .select()
    .from(eventOutbox)
    .where(eq(eventOutbox.id, id));
  return row;
}

describe('publishOutboxEvent', () => {
  it('publishes a known event whose payload carries the row tenant', async () => {
    const payload = {
      accountId,
      conversationId: randomUUID(),
      messageId: randomUUID(),
    };
    const { eventId, outboxId } = await seedOutboxRow({
      eventType: 'message.received',
      payload,
    });

    await expect(publishOutboxEvent(eventId)).resolves.toEqual({
      published: true,
      claimed: true,
    });
    expect(inngest.send).toHaveBeenCalledWith({
      id: eventId,
      name: 'message.received',
      data: payload,
    });

    const row = await outboxRow(outboxId);
    expect(row.publishedAt).not.toBeNull();
    expect(row.lastError).toBeNull();
  });

  it('drains an event type the app never emits without reaching Inngest', async () => {
    const { eventId, outboxId } = await seedOutboxRow({
      eventType: 'accounts.plan_granted',
      payload: { accountId },
    });

    await expect(publishOutboxEvent(eventId)).resolves.toEqual({
      published: false,
      claimed: true,
    });
    expect(inngest.send).not.toHaveBeenCalled();

    const row = await outboxRow(outboxId);
    expect(row.publishedAt).not.toBeNull();
    expect(row.lastError).toBe('rejected: unknown_event_type');
  });

  it('drains a payload whose accountId is another tenant without reaching Inngest', async () => {
    const { eventId, outboxId } = await seedOutboxRow({
      eventType: 'notification.requested',
      payload: {
        accountId: randomUUID(),
        kind: 'appointment.booked',
        appointmentId: randomUUID(),
        customerId: randomUUID(),
        startsAt: new Date().toISOString(),
        previousStartsAt: null,
      },
    });

    await expect(publishOutboxEvent(eventId)).resolves.toEqual({
      published: false,
      claimed: true,
    });
    expect(inngest.send).not.toHaveBeenCalled();

    const row = await outboxRow(outboxId);
    expect(row.publishedAt).not.toBeNull();
    expect(row.lastError).toBe('rejected: payload_account_id_mismatch');
  });

  it('drains a payload that is not an object without reaching Inngest', async () => {
    const { eventId, outboxId } = await seedOutboxRow({
      eventType: 'message.received',
      payload: 'not-an-object',
    });

    await expect(publishOutboxEvent(eventId)).resolves.toEqual({
      published: false,
      claimed: true,
    });
    expect(inngest.send).not.toHaveBeenCalled();

    const row = await outboxRow(outboxId);
    expect(row.lastError).toBe('rejected: payload_not_object');
  });

  it('reports nothing claimed for an unknown event id', async () => {
    await expect(publishOutboxEvent(randomUUID())).resolves.toEqual({
      published: false,
      claimed: false,
    });
    expect(inngest.send).not.toHaveBeenCalled();
  });
});

describe('publishDueOutboxEvents', () => {
  it('counts a refused forgery apart from a transport failure', async () => {
    // Both used to land in `failed`, so a healthy run that drained one forged
    // row was indistinguishable from Inngest being unreachable.
    await seedOutboxRow({ eventType: 'accounts.plan_granted', payload: { accountId } });
    await seedOutboxRow({
      eventType: 'message.received',
      payload: { accountId, conversationId: randomUUID(), messageId: randomUUID() },
    });
    vi.mocked(inngest.send).mockRejectedValueOnce(new Error('inngest down'));

    await expect(publishDueOutboxEvents()).resolves.toEqual({
      claimed: 2,
      published: 0,
      failed: 1,
      rejected: 1,
      deadLettered: 0,
    });
  });

  it('dead-letters a row that has exhausted its publish attempts', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { outboxId } = await seedOutboxRow({
      eventType: 'message.received',
      payload: { accountId, conversationId: randomUUID(), messageId: randomUUID() },
    });
    await db
      .update(eventOutbox)
      .set({ attempts: MAX_PUBLISH_ATTEMPTS })
      .where(eq(eventOutbox.id, outboxId));
    vi.mocked(inngest.send).mockRejectedValue(new Error('poison'));

    await expect(publishDueOutboxEvents()).resolves.toMatchObject({
      claimed: 1,
      published: 0,
      failed: 0,
      deadLettered: 1,
    });

    // Drained, not retried forever: the row stops being claimed every minute.
    const row = await outboxRow(outboxId);
    expect(row.publishedAt).not.toBeNull();
    expect(row.lastError).toContain('dead_letter: poison');
  });
});
