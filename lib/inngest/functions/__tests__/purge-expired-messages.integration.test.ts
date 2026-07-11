import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, addHours, subDays } from 'date-fns';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  auditLog,
  conversations,
  messages,
  patients,
  reminderJobs,
} from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import {
  AUDIT_LOG_RETENTION_DAYS,
  purgeExpiredAuditLog,
  purgePtExpiredMessages,
} from '../purge-expired-messages';

let ptId = '';
let patientId = '';
let conversationId = '';
let appointmentId = '';

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `purge-${Date.now()}@example.com`,
    password: 'purge-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

beforeEach(async () => {
  await db.delete(auditLog).where(eq(auditLog.ptId, ptId));
  await db.delete(patients).where(eq(patients.ptId, ptId));

  const [patient] = await db
    .insert(patients)
    .values({ ptId, name: 'Purge Patient', phone: '447700900103' })
    .returning({ id: patients.id });
  patientId = patient.id;

  const [conversation] = await db
    .insert(conversations)
    .values({ ptId, patientId, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  conversationId = conversation.id;

  const startsAt = addDays(new Date(), 10);
  const [appointment] = await db
    .insert(appointments)
    .values({
      ptId,
      patientId,
      startsAt,
      endsAt: addHours(startsAt, 1),
      status: 'confirmed',
    })
    .returning({ id: appointments.id });
  appointmentId = appointment.id;
});

describe('purgePtExpiredMessages', () => {
  it('deletes expired messages, keeps recent and reminder-protected ones', async () => {
    const now = new Date();
    const [expired, recent, protectedMsg] = await db
      .insert(messages)
      .values([
        {
          ptId,
          conversationId,
          role: 'patient',
          channel: 'whatsapp',
          content: 'expired',
          createdAt: subDays(now, 31),
        },
        {
          ptId,
          conversationId,
          role: 'patient',
          channel: 'whatsapp',
          content: 'recent',
          createdAt: subDays(now, 29),
        },
        {
          ptId,
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
      ptId,
      appointmentId,
      scheduledFor: subDays(now, 31),
      status: 'sent',
      messageId: protectedMsg.id,
    });

    const result = await purgePtExpiredMessages({ ptId, retentionDays: 30, now });
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

describe('purgeExpiredAuditLog', () => {
  it('deletes rows older than the retention window and keeps newer ones', async () => {
    const now = new Date();
    const [stale, fresh] = await db
      .insert(auditLog)
      .values([
        {
          ptId,
          actor: 'system',
          action: 'stale',
          targetTable: 'patients',
          occurredAt: subDays(now, AUDIT_LOG_RETENTION_DAYS + 1),
        },
        {
          ptId,
          actor: 'system',
          action: 'fresh',
          targetTable: 'patients',
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
