import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  auditLog,
  conversationDays,
  conversations,
  erasureArchive,
  events,
  messages,
  customers,
  accounts,
  reminderDeliveries,
  reminderJobs,
  whatsappContacts,
} from '@/lib/db/schema';
import {
  conversationDayKeys,
  getConversationUsage,
  getReminderUsage,
} from '@/lib/billing/usage';
import { createServiceClient } from '@/lib/supabase/service';
import { eraseCustomer } from '../erase';

const tryPublish = vi.hoisted(() => vi.fn(async () => {}));
vi.mock('@/lib/events/outbox', () => ({
  tryPublishOutboxEvent: tryPublish,
}));

const WA_ID = '447700900555';

let accountId = '';
let otherAccountId = '';
let customerId = '';
let conversationId = '';
let confirmedApptId = '';
let completedApptId = '';

async function makeUser(stamp: string): Promise<string> {
  const sb = createServiceClient();
  const { data, error } = await sb.auth.admin.createUser({
    email: `erase-${stamp}@example.com`,
    password: 'erase-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser: ${error?.message}`);
  return data.user.id;
}

beforeAll(async () => {
  accountId = await makeUser(`a-${Date.now()}`);
  otherAccountId = await makeUser(`b-${Date.now()}`);
});

afterAll(async () => {
  const sb = createServiceClient();
  if (accountId) await db.delete(erasureArchive).where(eq(erasureArchive.accountId, accountId));
  if (accountId) await sb.auth.admin.deleteUser(accountId);
  if (otherAccountId) await sb.auth.admin.deleteUser(otherAccountId);
});

beforeEach(async () => {
  tryPublish.mockClear();
  await db.delete(auditLog).where(eq(auditLog.accountId, accountId));
  // erasure_archive has no FK to accounts, so it survives every other cleanup.
  await db.delete(erasureArchive).where(eq(erasureArchive.accountId, accountId));
  // conversation_days and reminder_deliveries outlive the customer by design
  // (SET NULL), so they need their own cleanup — deleting customers no longer
  // takes them with it.
  await db.delete(conversationDays).where(eq(conversationDays.accountId, accountId));
  await db.delete(reminderDeliveries).where(eq(reminderDeliveries.accountId, accountId));
  await db.delete(customers).where(eq(customers.accountId, accountId));
  await db.delete(whatsappContacts).where(eq(whatsappContacts.accountId, accountId));
  await db.delete(events).where(eq(events.accountId, accountId));

  const [customer] = await db
    .insert(customers)
    .values({ accountId, name: 'Erased One', phone: WA_ID, waId: WA_ID })
    .returning({ id: customers.id });
  customerId = customer.id;

  const [conv] = await db
    .insert(conversations)
    .values({ accountId, customerId, channel: 'whatsapp', lastInboundAt: new Date() })
    .returning({ id: conversations.id });
  conversationId = conv.id;

  await db.insert(messages).values({
    accountId,
    conversationId: conv.id,
    role: 'customer',
    channel: 'whatsapp',
    content: 'hi there',
  });

  const [confirmed] = await db
    .insert(appointments)
    .values({
      accountId,
      customerId,
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 90_000_000),
      serviceType: 'checkup',
      status: 'confirmed',
    })
    .returning({ id: appointments.id });
  confirmedApptId = confirmed.id;

  const [completed] = await db
    .insert(appointments)
    .values({
      accountId,
      customerId,
      startsAt: new Date(Date.now() - 90_000_000),
      endsAt: new Date(Date.now() - 86_400_000),
      serviceType: 'checkup',
      status: 'completed',
    })
    .returning({ id: appointments.id });
  completedApptId = completed.id;

  await db.insert(reminderJobs).values({
    accountId,
    appointmentId: confirmedApptId,
    scheduledFor: new Date(Date.now() + 43_200_000),
  });

  await db
    .insert(whatsappContacts)
    .values({ accountId, phone: WA_ID, waId: WA_ID });
});

describe('eraseCustomer', () => {
  it('cascade-deletes all customer data and leaves no orphans', async () => {
    const result = await eraseCustomer({ customerId, accountId });
    expect(result).toEqual({ erased: true });

    const remaining = await Promise.all([
      db.select().from(customers).where(eq(customers.id, customerId)),
      db
        .select()
        .from(conversations)
        .where(eq(conversations.customerId, customerId)),
      db.select().from(messages).where(eq(messages.accountId, accountId)),
      db
        .select()
        .from(appointments)
        .where(eq(appointments.customerId, customerId)),
      db.select().from(reminderJobs).where(eq(reminderJobs.accountId, accountId)),
      db
        .select()
        .from(whatsappContacts)
        .where(eq(whatsappContacts.waId, WA_ID)),
    ]);
    for (const rows of remaining) expect(rows).toHaveLength(0);
  });

  it('deletes the synced contact of a manually added customer (wa_id NULL)', async () => {
    const [manual] = await db
      .insert(customers)
      .values({ accountId, name: 'Ana Hoxha', phone: '+355 69 123 4567' })
      .returning({ id: customers.id });
    await db
      .insert(whatsappContacts)
      .values({ accountId, phone: '355691234567', fullName: 'Ana Hoxha' });

    const result = await eraseCustomer({ customerId: manual.id, accountId });
    expect(result).toEqual({ erased: true });

    // Only the other customer's contact (matched on wa_id) is left standing.
    const remaining = await db
      .select({ phone: whatsappContacts.phone })
      .from(whatsappContacts)
      .where(eq(whatsappContacts.accountId, accountId));
    expect(remaining.map((r) => r.phone)).toEqual([WA_ID]);
  });

  it('keeps the metered conversation day counting after erasure', async () => {
    const [account] = await db
      .select({ timezone: accounts.timezone })
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .limit(1);
    const now = new Date();
    const { localDay, monthKey } = conversationDayKeys(now, account.timezone);
    await db.insert(conversationDays).values({
      accountId,
      customerId,
      conversationId,
      localDay,
      monthKey,
      firstMessageId: crypto.randomUUID(),
    });

    const before = await getConversationUsage(accountId, now);
    expect(before.used).toBe(1);

    expect(await eraseCustomer({ customerId, accountId })).toEqual({ erased: true });

    // Personal data is gone (customer row + its conversation)...
    expect(
      await db.select().from(customers).where(eq(customers.id, customerId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId)),
    ).toHaveLength(0);

    // ...but the billing fact survives, anonymised by ON DELETE SET NULL.
    const days = await db
      .select()
      .from(conversationDays)
      .where(eq(conversationDays.accountId, accountId));
    expect(days).toHaveLength(1);
    expect(days[0].customerId).toBeNull();
    expect(days[0].conversationId).toBeNull();
    expect(days[0].localDay).toBe(localDay);
    expect(days[0].monthKey).toBe(monthKey);
    // first_message_id is a bare uuid with no FK, so nothing nulls it for us:
    // erasure has to scrub it by hand or the surviving row keeps pointing at the
    // deleted message.
    expect(days[0].firstMessageId).toBeNull();

    // ...and still counts, so erasing clients can't win back free-plan quota.
    const after = await getConversationUsage(accountId, now);
    expect(after.used).toBe(before.used);
    expect(after.monthKey).toBe(monthKey);
  });

  it('keeps the metered reminder delivery counting after erasure', async () => {
    const wamid = `wamid.erase-${Date.now()}`;
    const deliveredAt = new Date();
    await db.insert(reminderDeliveries).values({
      accountId,
      appointmentId: confirmedApptId,
      externalId: wamid,
      deliveredAt,
    });

    const before = await getReminderUsage(accountId, deliveredAt);
    expect(before.delivered).toBe(1);
    expect(before.used).toBe(1);

    expect(await eraseCustomer({ customerId, accountId })).toEqual({ erased: true });

    // The scheduling row is customer data and goes with the appointment...
    expect(
      await db.select().from(reminderJobs).where(eq(reminderJobs.accountId, accountId)),
    ).toHaveLength(0);

    // ...but the billed delivery survives with nothing customer-linked left on
    // it: the appointment reference is nulled by the FK and the wamid (which
    // embeds the recipient's number) is rewritten.
    const deliveries = await db
      .select()
      .from(reminderDeliveries)
      .where(eq(reminderDeliveries.accountId, accountId));
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].appointmentId).toBeNull();
    expect(deliveries[0].externalId).toBe(`erased:${deliveries[0].id}`);
    expect(deliveries[0].deliveredAt.getTime()).toBe(deliveredAt.getTime());

    // ...and still counts, so erasing clients can't win back reminder quota
    // that was already spent with Meta.
    const after = await getReminderUsage(accountId, deliveredAt);
    expect(after.delivered).toBe(before.delivered);
    expect(after.used).toBe(before.used);
  });

  it('archives a durable per-customer erasure proof outside audit_log', async () => {
    await eraseCustomer({ customerId, accountId });

    const rows = await db
      .select()
      .from(erasureArchive)
      .where(eq(erasureArchive.accountId, accountId));
    expect(rows).toHaveLength(1);
    expect(rows[0].scope).toBe('customer');
    expect(rows[0].targetId).toBe(customerId);
    expect(rows[0].beforeStateHash).toMatch(/^[0-9a-f]{64}$/);

    const metadata = rows[0].metadata as Record<string, unknown>;
    expect(typeof metadata.erasedAt).toBe('string');
    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain('Erased One');
    expect(serialized).not.toContain(WA_ID);

    // The missing-customer no-op archives nothing.
    await eraseCustomer({ customerId, accountId });
    const after = await db
      .select()
      .from(erasureArchive)
      .where(eq(erasureArchive.accountId, accountId));
    expect(after).toHaveLength(1);
  });

  it('emits appointment.cancelled only for the active appointment', async () => {
    await eraseCustomer({ customerId, accountId });

    const cancelled = await db
      .select()
      .from(events)
      .where(and(eq(events.accountId, accountId), eq(events.type, 'appointment.cancelled')));
    expect(cancelled).toHaveLength(1);

    const payload = cancelled[0].payload as Record<string, unknown>;
    expect(payload.appointmentId).toBe(confirmedApptId);
    expect(payload.cancelledBy).toBe('account');
    expect(payload.reason).toBe('customer_erased');

    const allEvents = await db.select().from(events).where(eq(events.accountId, accountId));
    const referencesCompleted = allEvents.some(
      (e) =>
        (e.payload as Record<string, unknown>).appointmentId ===
        completedApptId,
    );
    expect(referencesCompleted).toBe(false);

    expect(tryPublish).toHaveBeenCalledTimes(1);
    expect(tryPublish).toHaveBeenCalledWith(cancelled[0].id);
  });

  it('writes exactly one erasure audit row with a hash and no PII', async () => {
    await eraseCustomer({ customerId, accountId });

    const rows = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.accountId, accountId), eq(auditLog.action, 'erasure')));
    expect(rows).toHaveLength(1);
    expect(rows[0].targetTable).toBe('customers');
    expect(rows[0].targetId).toBe(customerId);

    const metadata = rows[0].metadata as Record<string, unknown>;
    expect(metadata.beforeStateHash).toMatch(/^[0-9a-f]{64}$/);

    const serialized = JSON.stringify(metadata);
    expect(serialized).not.toContain('Erased One');
    expect(serialized).not.toContain(WA_ID);
  });

  it('is idempotent: a second erase is a no-op', async () => {
    await eraseCustomer({ customerId, accountId });
    tryPublish.mockClear();

    const second = await eraseCustomer({ customerId, accountId });
    expect(second).toEqual({ erased: false });
    expect(tryPublish).not.toHaveBeenCalled();

    const auditRows = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.accountId, accountId), eq(auditLog.action, 'erasure')));
    expect(auditRows).toHaveLength(1);
  });

  it('does not erase across tenants', async () => {
    const result = await eraseCustomer({ customerId, accountId: otherAccountId });
    expect(result).toEqual({ erased: false });
    expect(tryPublish).not.toHaveBeenCalled();

    const stillThere = await db
      .select()
      .from(customers)
      .where(eq(customers.id, customerId));
    expect(stillThere).toHaveLength(1);
  });
});
