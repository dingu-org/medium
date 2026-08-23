import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, addHours, subDays } from 'date-fns';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  auditLog,
  conversations,
  eventOutbox,
  events,
  messages,
  customers,
  reminderJobs,
} from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import {
  AUDIT_LOG_RETENTION_DAYS,
  purgeExpiredAuditLog,
  purgeAccountExpiredMessages,
} from '../purge-expired-messages';

let accountId = '';
let customerId = '';
let conversationId = '';
let appointmentId = '';

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `purge-${Date.now()}@example.com`,
    password: 'purge-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  accountId = data.user.id;
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

beforeEach(async () => {
  await db.delete(auditLog).where(eq(auditLog.accountId, accountId));
  await db.delete(eventOutbox).where(eq(eventOutbox.accountId, accountId));
  await db.delete(events).where(eq(events.accountId, accountId));
  await db.delete(customers).where(eq(customers.accountId, accountId));

  const [customer] = await db
    .insert(customers)
    .values({ accountId, name: 'Purge Customer', phone: '447700900103' })
    .returning({ id: customers.id });
  customerId = customer.id;

  const [conversation] = await db
    .insert(conversations)
    .values({ accountId, customerId, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  conversationId = conversation.id;

  const startsAt = addDays(new Date(), 10);
  const [appointment] = await db
    .insert(appointments)
    .values({
      accountId,
      customerId,
      startsAt,
      endsAt: addHours(startsAt, 1),
      status: 'confirmed',
    })
    .returning({ id: appointments.id });
  appointmentId = appointment.id;
});

describe('purgeAccountExpiredMessages', () => {
  it('deletes expired messages, keeps recent and reminder-protected ones', async () => {
    const now = new Date();
    const [expired, recent, protectedMsg] = await db
      .insert(messages)
      .values([
        {
          accountId,
          conversationId,
          role: 'customer',
          channel: 'whatsapp',
          content: 'expired',
          createdAt: subDays(now, 31),
        },
        {
          accountId,
          conversationId,
          role: 'customer',
          channel: 'whatsapp',
          content: 'recent',
          createdAt: subDays(now, 29),
        },
        {
          accountId,
          conversationId,
          role: 'ai',
          channel: 'whatsapp',
          content: 'protected',
          createdAt: subDays(now, 31),
        },
      ])
      .returning({ id: messages.id });

    // Protect the third message via a reminder tied to an active appointment.
    await db.insert(reminderJobs).values({
      accountId,
      appointmentId,
      scheduledFor: subDays(now, 31),
      status: 'sent',
      messageId: protectedMsg.id,
    });

    const result = await purgeAccountExpiredMessages({ accountId, retentionDays: 30, now });
    expect(result.deletedCount).toBe(1);

    const remaining = await db
      .select({ id: messages.id })
      .from(messages)
      .where(inArray(messages.id, [expired.id, recent.id, protectedMsg.id]));
    expect(remaining.map((r) => r.id).sort()).toEqual(
      [recent.id, protectedMsg.id].sort(),
    );
  });
});

describe('purgeAccountExpiredMessages — events retention', () => {
  it('drops expired events but keeps unpublished and billing ones', async () => {
    const now = new Date();
    const [expiredEvent, recentEvent, owedEvent, billingEvent] = await db
      .insert(events)
      .values([
        {
          accountId,
          type: 'appointment.booked',
          payload: { accountId, customerId },
          occurredAt: subDays(now, 31),
        },
        {
          accountId,
          type: 'appointment.booked',
          payload: { accountId, customerId },
          occurredAt: subDays(now, 29),
        },
        {
          accountId,
          type: 'appointment.cancelled',
          payload: { accountId, customerId },
          occurredAt: subDays(now, 31),
        },
        {
          accountId,
          type: 'billing.limit_warning',
          payload: { accountId, kind: 'reminders', monthKey: '2026-07' },
          occurredAt: subDays(now, 31),
        },
      ])
      .returning({ id: events.id });

    // Still owed to a consumer — and event_outbox cascades from events.
    await db.insert(eventOutbox).values({
      accountId,
      eventId: owedEvent.id,
      eventType: 'appointment.cancelled',
      payload: { accountId, customerId },
    });

    const result = await purgeAccountExpiredMessages({ accountId, retentionDays: 30, now });
    expect(result.deletedEventCount).toBe(1);

    const survivors = await db
      .select({ id: events.id })
      .from(events)
      .where(
        inArray(events.id, [
          expiredEvent.id,
          recentEvent.id,
          owedEvent.id,
          billingEvent.id,
        ]),
      );
    expect(survivors.map((r) => r.id).sort()).toEqual(
      [recentEvent.id, owedEvent.id, billingEvent.id].sort(),
    );
  });
});

describe('purgeExpiredAuditLog', () => {
  it('deletes rows older than the retention window and keeps newer ones', async () => {
    const now = new Date();
    const [stale, fresh] = await db
      .insert(auditLog)
      .values([
        {
          accountId,
          actor: 'system',
          action: 'stale',
          targetTable: 'customers',
          occurredAt: subDays(now, AUDIT_LOG_RETENTION_DAYS + 1),
        },
        {
          accountId,
          actor: 'system',
          action: 'fresh',
          targetTable: 'customers',
          occurredAt: subDays(now, AUDIT_LOG_RETENTION_DAYS - 1),
        },
      ])
      .returning({ id: auditLog.id });

    await purgeExpiredAuditLog(now);

    const survivors = await db
      .select({ id: auditLog.id })
      .from(auditLog)
      .where(inArray(auditLog.id, [stale.id, fresh.id]));
    expect(survivors.map((r) => r.id)).toEqual([fresh.id]);
  });
});
