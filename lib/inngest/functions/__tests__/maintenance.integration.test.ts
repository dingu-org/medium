import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { addDays, addHours, subDays, subMinutes } from 'date-fns';
import { eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  auditLog,
  conversations,
  messages,
  customers,
  accounts,
  reminderJobs,
  whatsappConnections,
} from '@/lib/db/schema';
import { encryptToken } from '@/lib/db/crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { excludeForeignRows } from '@/tests/support/isolation';
import { checkResumeOffer } from '../offer-resume';
import {
  claimTokenExpiryWarnings,
  pollConnectionQuality,
} from '../poll-whatsapp-health';
import { purgeAccountExpiredMessages } from '../purge-expired-messages';

let accountId = '';
let customerId = '';
let conversationId = '';
let appointmentId = '';
let connectionId = '';
let sequence = 0;

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `maintenance-jobs-${Date.now()}@example.com`,
    password: 'maintenance-jobs-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  accountId = data.user.id;
});

beforeEach(async () => {
  await db.delete(auditLog).where(eq(auditLog.accountId, accountId));
  await db
    .delete(whatsappConnections)
    .where(eq(whatsappConnections.accountId, accountId));
  await db.delete(customers).where(eq(customers.accountId, accountId));
  await db.update(accounts).set({ retentionDays: 30 }).where(eq(accounts.id, accountId));
  // `claimTokenExpiryWarnings` sweeps every active connection in the database,
  // so stamp the other tenants' rows as already warned and leave this suite's
  // connection as the only candidate.
  await excludeForeignRows(whatsappConnections, accountId, {
    expiryWarningSentAt: new Date(),
  });

  const [connection] = await db
    .insert(whatsappConnections)
    .values({
      accountId,
      phoneNumberId: `PNI_MAINT_${Date.now()}_${++sequence}`,
      wabaId: 'WABA_MAINT',
      accessTokenEncrypted: await encryptToken('MAINT_TOKEN'),
      status: 'active',
      qualityRating: 'GREEN',
      tokenExpiresAt: addDays(new Date(), 5),
    })
    .returning({ id: whatsappConnections.id });
  connectionId = connection.id;

  const [customer] = await db
    .insert(customers)
    .values({
      accountId,
      name: 'Maintenance Customer',
      phone: '447700900102',
      waId: '447700900102',
    })
    .returning({ id: customers.id });
  customerId = customer.id;

  const [conversation] = await db
    .insert(conversations)
    .values({
      accountId,
      customerId,
      channel: 'whatsapp',
      aiActive: false,
    })
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
      status: 'pending',
    })
    .returning({ id: appointments.id });
  appointmentId = appointment.id;
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

describe('retention purge', () => {
  it('deletes expired messages but preserves recent and active-reminder messages', async () => {
    const now = new Date();
    const [expired, recent, protectedReminder] = await db
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
          content: 'protected reminder',
          createdAt: subDays(now, 31),
        },
      ])
      .returning({ id: messages.id });
    await db.insert(reminderJobs).values({
      accountId,
      appointmentId,
      scheduledFor: subDays(now, 31),
      status: 'sent',
      messageId: protectedReminder.id,
    });

    const result = await purgeAccountExpiredMessages({
      accountId,
      retentionDays: 30,
      now,
    });

    expect(result.deletedCount).toBe(1);
    const remaining = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        inArray(messages.id, [expired.id, recent.id, protectedReminder.id]),
      );
    expect(remaining.map((row) => row.id).sort()).toEqual(
      [recent.id, protectedReminder.id].sort(),
    );
    const [audit] = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.accountId, accountId));
    expect(audit).toMatchObject({
      action: 'messages.retention_purge',
      metadata: {
        deletedCount: 1,
        retentionDays: 30,
      },
    });
  });
});

describe('conversation inactivity', () => {
  it('offers resume only while AI is inactive and the PT has been quiet', async () => {
    await expect(
      checkResumeOffer({ accountId, conversationId, customerId }),
    ).resolves.toEqual({ offer: true });

    // A PT reply inside the idle window defers the offer rather than dropping
    // it: the caller re-arms at `retryAt` (the reply + the 1h idle window).
    const accountReplyAt = subMinutes(new Date(), 10);
    await db.insert(messages).values({
      accountId,
      conversationId,
      role: 'account',
      channel: 'whatsapp',
      content: 'I am handling this',
      createdAt: accountReplyAt,
    });
    await expect(
      checkResumeOffer({ accountId, conversationId, customerId }),
    ).resolves.toEqual({
      offer: false,
      reason: 'recent_account_activity',
      retryAt: addHours(accountReplyAt, 1).toISOString(),
    });

    await db
      .update(conversations)
      .set({ aiActive: true })
      .where(eq(conversations.id, conversationId));
    await expect(
      checkResumeOffer({ accountId, conversationId, customerId }),
    ).resolves.toEqual({ offer: false, reason: 'ai_active' });
  });
});

describe('WhatsApp health monitoring', () => {
  it('emits a quality warning only when entering a warning state', async () => {
    const first = await pollConnectionQuality({
      connectionId,
      getQualityRatingFn: async () => ({
        qualityRating: 'YELLOW',
        tier: 'TIER_250',
      }),
    });
    const second = await pollConnectionQuality({
      connectionId,
      getQualityRatingFn: async () => ({
        qualityRating: 'YELLOW',
        tier: 'TIER_250',
      }),
    });

    expect(first).toMatchObject({
      kind: 'updated',
      warning: true,
      qualityRating: 'YELLOW',
      tier: 'TIER_250',
    });
    expect(second).toMatchObject({
      kind: 'updated',
      warning: false,
    });
  });

  it('claims one expiry warning per connection', async () => {
    const now = new Date();
    const first = await claimTokenExpiryWarnings(now);
    const second = await claimTokenExpiryWarnings(now);

    expect(first).toEqual([
      expect.objectContaining({
        accountId,
        connectionId,
        daysRemaining: 5,
      }),
    ]);
    expect(second).toEqual([]);
  });
});
