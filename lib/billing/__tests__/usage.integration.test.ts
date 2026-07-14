import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  conversationDays,
  conversations,
  events,
  eventOutbox,
  messages,
  patients,
  pts,
} from '@/lib/db/schema';
import {
  checkAndRecordConversation,
  getConversationUsage,
} from '@/lib/billing/usage';
import { getPlan } from '@/lib/billing/plans';
import { createServiceClient } from '@/lib/supabase/service';

const FREE_LIMIT = getPlan('free').conversationsPerMonth;
let ptId = '';
let patientId = '';
let conversationId = '';
let seq = 0;

async function makePatientConversation(): Promise<{
  patientId: string;
  conversationId: string;
}> {
  seq += 1;
  const [patient] = await db
    .insert(patients)
    .values({ ptId, name: `P${seq}`, phone: `44770090${seq}`, waId: `44770090${seq}` })
    .returning({ id: patients.id });
  const [conversation] = await db
    .insert(conversations)
    .values({ ptId, patientId: patient.id, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  return { patientId: patient.id, conversationId: conversation.id };
}

/** Seed a counted day-fact directly (bypasses the gate) for a distinct day. */
async function seedDay(monthKey: string, localDay: string) {
  await db.insert(conversationDays).values({
    ptId,
    patientId,
    conversationId,
    localDay,
    monthKey,
    firstMessageId: crypto.randomUUID(),
  });
}

/**
 * Seed a contiguous range of counted day-facts in ONE insert. Bulk-inserting
 * keeps these cap-filling tests well under the default timeout — dozens of
 * single-row round-trips otherwise flirt with it.
 */
async function seedDayRange(monthKey: string, startDay: number, endDay: number) {
  if (startDay > endDay) return;
  const values = [];
  for (let day = startDay; day <= endDay; day += 1) {
    values.push({
      ptId,
      patientId,
      conversationId,
      localDay: `${monthKey}-${String(day).padStart(2, '0')}`,
      monthKey,
      firstMessageId: crypto.randomUUID(),
    });
  }
  await db.insert(conversationDays).values(values);
}

async function countEvents(type: string): Promise<number> {
  const rows = await db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.ptId, ptId), eq(events.type, type)));
  return rows.length;
}

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `usage-${Date.now()}@example.com`,
    password: 'usage-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
});

beforeEach(async () => {
  await db.delete(conversationDays).where(eq(conversationDays.ptId, ptId));
  await db.delete(messages).where(eq(messages.ptId, ptId));
  await db.delete(conversations).where(eq(conversations.ptId, ptId));
  await db.delete(patients).where(eq(patients.ptId, ptId));
  await db.delete(eventOutbox).where(eq(eventOutbox.ptId, ptId));
  await db.delete(events).where(eq(events.ptId, ptId));
  await db
    .update(pts)
    .set({ plan: 'free', planLifetime: false, planExpiresAt: null, timezone: 'UTC' })
    .where(eq(pts.id, ptId));
  const seeded = await makePatientConversation();
  patientId = seeded.patientId;
  conversationId = seeded.conversationId;
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

describe('checkAndRecordConversation', () => {
  it('counts a patient-day once and is idempotent for the same day', async () => {
    const args = {
      ptId,
      patientId,
      conversationId,
      plan: 'free' as const,
      timezone: 'UTC',
      inboundMessageId: crypto.randomUUID(),
      instant: new Date('2026-07-05T10:00:00Z'),
    };
    const first = await checkAndRecordConversation(args);
    const second = await checkAndRecordConversation({
      ...args,
      inboundMessageId: crypto.randomUUID(),
      instant: new Date('2026-07-05T18:00:00Z'),
    });

    expect(first).toMatchObject({ status: 'allowed', counted: true });
    expect(second).toMatchObject({ status: 'allowed', counted: false });

    const rows = await db
      .select({ id: conversationDays.id })
      .from(conversationDays)
      .where(eq(conversationDays.ptId, ptId));
    expect(rows).toHaveLength(1);
  });

  it('keys the day-fact by the PT timezone (Europe/Tirane)', async () => {
    // 22:30 UTC on Jul 31 is 00:30 Aug 1 in Tirane (UTC+2).
    await checkAndRecordConversation({
      ptId,
      patientId,
      conversationId,
      plan: 'free',
      timezone: 'Europe/Tirane',
      inboundMessageId: crypto.randomUUID(),
      instant: new Date('2026-07-31T22:30:00Z'),
    });
    const [row] = await db
      .select({
        localDay: conversationDays.localDay,
        monthKey: conversationDays.monthKey,
      })
      .from(conversationDays)
      .where(eq(conversationDays.ptId, ptId));
    expect(row).toMatchObject({ localDay: '2026-08-01', monthKey: '2026-08' });
  });

  it('lets exactly one of two boundary racers through', { timeout: 15000 }, async () => {
    // Pre-fill to one below the cap with distinct filler days.
    await seedDayRange('2026-07', 1, FREE_LIMIT - 1);
    const a = await makePatientConversation();
    const b = await makePatientConversation();

    const [ra, rb] = await Promise.all([
      checkAndRecordConversation({
        ptId,
        patientId: a.patientId,
        conversationId: a.conversationId,
        plan: 'free',
        timezone: 'UTC',
        inboundMessageId: crypto.randomUUID(),
        instant: new Date('2026-07-30T09:00:00Z'),
      }),
      checkAndRecordConversation({
        ptId,
        patientId: b.patientId,
        conversationId: b.conversationId,
        plan: 'free',
        timezone: 'UTC',
        inboundMessageId: crypto.randomUUID(),
        instant: new Date('2026-07-30T09:00:00Z'),
      }),
    ]);

    const statuses = [ra.status, rb.status].sort();
    expect(statuses).toEqual(['allowed', 'at_cap']);

    const rows = await db
      .select({ id: conversationDays.id })
      .from(conversationDays)
      .where(
        and(
          eq(conversationDays.ptId, ptId),
          eq(conversationDays.monthKey, '2026-07'),
        ),
      );
    expect(rows).toHaveLength(FREE_LIMIT);
  });

  it('emits one warning and one reached event, deduped', { timeout: 15000 }, async () => {
    const warn = Math.ceil(0.8 * FREE_LIMIT);
    // Seed up to just below the warn threshold.
    await seedDayRange('2026-07', 1, warn - 1);
    // Crossing the warn threshold emits exactly one warning.
    await checkAndRecordConversation({
      ptId,
      patientId,
      conversationId,
      plan: 'free',
      timezone: 'UTC',
      inboundMessageId: crypto.randomUUID(),
      instant: new Date(`2026-07-${String(warn).padStart(2, '0')}T10:00:00Z`),
    });
    expect(await countEvents('billing.limit_warning')).toBe(1);
    expect(await countEvents('billing.limit_reached')).toBe(0);

    // Fill the gap up to just below the cap, then cross it.
    await seedDayRange('2026-07', warn + 1, FREE_LIMIT - 1);
    await checkAndRecordConversation({
      ptId,
      patientId,
      conversationId,
      plan: 'free',
      timezone: 'UTC',
      inboundMessageId: crypto.randomUUID(),
      instant: new Date(
        `2026-07-${String(FREE_LIMIT).padStart(2, '0')}T10:00:00Z`,
      ),
    });
    expect(await countEvents('billing.limit_warning')).toBe(1);
    expect(await countEvents('billing.limit_reached')).toBe(1);

    // A fresh patient-day over the cap is turned away and emits nothing new.
    const over = await checkAndRecordConversation({
      ptId,
      patientId,
      conversationId,
      plan: 'free',
      timezone: 'UTC',
      inboundMessageId: crypto.randomUUID(),
      instant: new Date('2026-07-31T10:00:00Z'),
    });
    expect(over.status).toBe('at_cap');
    expect(await countEvents('billing.limit_warning')).toBe(1);
    expect(await countEvents('billing.limit_reached')).toBe(1);
  });
});

describe('getConversationUsage', () => {
  it('reports the effective plan cap and month usage', async () => {
    await seedDay('2026-07', '2026-07-01');
    await seedDay('2026-07', '2026-07-02');
    const usage = await getConversationUsage(
      ptId,
      new Date('2026-07-15T10:00:00Z'),
    );
    expect(usage).toMatchObject({
      used: 2,
      limit: FREE_LIMIT,
      monthKey: '2026-07',
      atCap: false,
    });
  });
});
