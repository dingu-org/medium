import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  auditLog,
  availabilityRules,
  billingOrders,
  blockedPeriods,
  conversationDays,
  conversations,
  costDaily,
  events,
  messageTemplates,
  messages,
  customers,
  accounts,
  pushSubscriptions,
  pwaMutations,
  reminderJobs,
  services,
  waMessageStatuses,
  whatsappConnections,
  whatsappContacts,
} from '@/lib/db/schema';
import { encryptToken } from '@/lib/db/crypto';
import { createServiceClient } from '@/lib/supabase/service';
import { buildCustomerExport, buildAccountExport } from '../export';

const TOKEN = 'PT_TOKEN_export_secret';

let accountId = '';
let otherAccountId = '';
let customerId = '';
let conversationId = '';

async function makeUser(stamp: string): Promise<string> {
  const sb = createServiceClient();
  const { data, error } = await sb.auth.admin.createUser({
    email: `export-${stamp}@example.com`,
    password: 'export-pass-1234',
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
  if (accountId) await sb.auth.admin.deleteUser(accountId);
  if (otherAccountId) await sb.auth.admin.deleteUser(otherAccountId);
});

beforeEach(async () => {
  // Survives the customer delete below by design (ON DELETE SET NULL, 0025), so
  // without its own cleanup every earlier test's metered day is still there and
  // the PT-wide export sees all of them.
  await db.delete(conversationDays).where(eq(conversationDays.accountId, accountId));
  await db.delete(customers).where(eq(customers.accountId, accountId));
  await db.delete(services).where(eq(services.accountId, accountId));
  await db.delete(availabilityRules).where(eq(availabilityRules.accountId, accountId));
  await db.delete(blockedPeriods).where(eq(blockedPeriods.accountId, accountId));
  await db.delete(messageTemplates).where(eq(messageTemplates.accountId, accountId));
  await db.delete(events).where(eq(events.accountId, accountId));
  await db.delete(auditLog).where(eq(auditLog.accountId, accountId));
  await db.delete(whatsappConnections).where(eq(whatsappConnections.accountId, accountId));
  await db.delete(whatsappContacts).where(eq(whatsappContacts.accountId, accountId));
  await db.delete(billingOrders).where(eq(billingOrders.accountId, accountId));
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.accountId, accountId));
  await db.delete(waMessageStatuses).where(eq(waMessageStatuses.accountId, accountId));
  await db.delete(costDaily).where(eq(costDaily.accountId, accountId));
  await db.delete(pwaMutations).where(eq(pwaMutations.accountId, accountId));

  const [customer] = await db
    .insert(customers)
    .values({ accountId, name: 'Exp Customer', phone: '+35544400111', waId: 'w1' })
    .returning({ id: customers.id });
  customerId = customer.id;

  const [conv] = await db
    .insert(conversations)
    .values({ accountId, customerId, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  conversationId = conv.id;

  await db.insert(messages).values({
    accountId,
    conversationId,
    role: 'customer',
    channel: 'whatsapp',
    content: 'export me',
  });
  const [appt] = await db
    .insert(appointments)
    .values({
      accountId,
      customerId,
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 90_000_000),
      serviceType: 'checkup',
    })
    .returning({ id: appointments.id });
  await db.insert(reminderJobs).values({
    accountId,
    appointmentId: appt.id,
    scheduledFor: new Date(Date.now() + 43_200_000),
    status: 'sent',
    sentAt: new Date(),
    responseType: 'confirm',
  });
  await db.insert(conversationDays).values({
    accountId,
    customerId,
    conversationId,
    localDay: '2026-07-15',
    monthKey: '2026-07',
  });
  // The coexistence sync stores the phone digits-only; the customer row keeps the
  // formatted E.164, so the export has to match on normalized digits.
  await db.insert(whatsappContacts).values({
    accountId,
    phone: '35544400111',
    fullName: 'Exp Customer',
  });
  await db.insert(billingOrders).values({
    accountId,
    pokOrderId: `pok-${Date.now()}`,
    plan: 'solo',
    period: 'monthly',
    amountMinor: 250_000,
  });
  await db.insert(waMessageStatuses).values({
    accountId,
    externalId: `wamid.export-${Date.now()}`,
    lastStatus: 'delivered',
    deliveredAt: new Date(),
    billable: true,
  });
  await db.insert(costDaily).values({ accountId, day: '2026-07-15' });
  await db.insert(pwaMutations).values({
    accountId,
    clientMutationId: `cm-${Date.now()}`,
    type: 'appointment.book',
  });
  await db.insert(pushSubscriptions).values({
    accountId,
    endpoint: `https://push.example.com/${Date.now()}`,
    keys: { p256dh: 'PUSH_P256DH_SECRET', auth: 'PUSH_AUTH_SECRET' },
    userAgent: 'Chrome/QA',
  });
  await db
    .insert(services)
    .values({ accountId, name: 'Consult', durationMin: 30, priceLek: 5000 });
  await db.insert(availabilityRules).values({
    accountId,
    weekday: 1,
    startTime: '09:00:00',
    endTime: '17:00:00',
  });
  await db.insert(blockedPeriods).values({
    accountId,
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 3_600_000),
  });
  await db.insert(messageTemplates).values({
    accountId,
    name: 'reminder',
    language: 'sq',
    body: 'Kujtues',
  });
  await db.insert(events).values({ accountId, type: 'seed.metric', payload: { count: 1 } });
  // Audit rows: one for this customer, one for another target (must be excluded).
  await db.insert(auditLog).values({
    accountId,
    actor: 'account',
    action: 'customer.notes_updated',
    targetTable: 'customers',
    targetId: customerId,
  });
  await db.insert(auditLog).values({
    accountId,
    actor: 'account',
    action: 'other',
    targetTable: 'customers',
    targetId: otherAccountId,
  });

  const encrypted = await encryptToken(TOKEN);
  await db.insert(whatsappConnections).values({
    accountId,
    phoneNumberId: `pn-${Date.now()}`,
    wabaId: 'WABA_EXPORT',
    accessTokenEncrypted: encrypted,
    displayPhoneNumber: '+355 69 123 4567',
    status: 'active',
  });

  // The accounts row itself comes from the signup trigger; set the Phase 15
  // profile fields on it so the export assertions can see them.
  await db
    .update(accounts)
    .set({
      fullName: 'Dr. Test',
      title: 'Fizioterapeut',
      address: 'Rr. Test 1, Tiranë',
      assistantPaused: true,
    })
    .where(eq(accounts.id, accountId));
});

describe('buildCustomerExport', () => {
  it('returns the full DSAR shape scoped to the customer with ISO dates', async () => {
    const result = await buildCustomerExport({ accountId, customerId });
    expect(result).not.toBeNull();
    const exp = result!;

    expect(exp.customer.id).toBe(customerId);
    expect(exp.conversations).toHaveLength(1);
    expect(exp.messages).toHaveLength(1);
    expect(exp.appointments).toHaveLength(1);

    // Only audit rows targeting this customer are included.
    expect(exp.audit_log_entries_for_customer).toHaveLength(1);
    expect(exp.audit_log_entries_for_customer[0].targetId).toBe(customerId);

    // Dates are serialized to ISO strings.
    expect(typeof exp.customer.createdAt).toBe('string');
    expect(typeof exp.appointments[0].startsAt).toBe('string');
  });

  it('discloses the data erasure treats as the customer\'s own', async () => {
    const exp = (await buildCustomerExport({ accountId, customerId }))!;

    // Matched on normalized phone digits even though customers.wa_id ('w1')
    // never matches the synced contact row.
    expect(exp.whatsapp_contacts).toHaveLength(1);
    expect(exp.whatsapp_contacts[0].fullName).toBe('Exp Customer');

    expect(exp.reminder_jobs).toHaveLength(1);
    expect(exp.reminder_jobs[0].responseType).toBe('confirm');
    expect(typeof exp.reminder_jobs[0].sentAt).toBe('string');

    expect(exp.conversation_days).toHaveLength(1);
    expect(exp.conversation_days[0].monthKey).toBe('2026-07');
  });

  it('scopes the added tables to the customer and their tenant', async () => {
    // A second customer of the same PT owns their own contact/day rows.
    const [other] = await db
      .insert(customers)
      .values({ accountId, name: 'Other Customer', phone: '+35544400222' })
      .returning({ id: customers.id });
    const [otherConv] = await db
      .insert(conversations)
      .values({ accountId, customerId: other.id, channel: 'whatsapp' })
      .returning({ id: conversations.id });
    await db
      .insert(whatsappContacts)
      .values({ accountId, phone: '35544400222', fullName: 'Other Customer' });
    await db.insert(conversationDays).values({
      accountId,
      customerId: other.id,
      conversationId: otherConv.id,
      localDay: '2026-07-16',
      monthKey: '2026-07',
    });

    const exp = (await buildCustomerExport({ accountId, customerId }))!;
    expect(exp.whatsapp_contacts).toHaveLength(1);
    expect(exp.whatsapp_contacts[0].phone).toBe('35544400111');
    expect(exp.conversation_days).toHaveLength(1);
    expect(exp.conversation_days[0].customerId).toBe(customerId);
  });

  it('withholds a contact row two customers of the PT share', async () => {
    // Nothing stops a PT from registering a couple, or a child and their carer,
    // on one number: both customers resolve to the SAME synced contact row, whose
    // full_name is whoever WhatsApp says owns the number. That row is not this
    // subject's data alone, so it must not appear in their DSAR.
    await db
      .insert(customers)
      .values({ accountId, name: 'Household Member', phone: '+355 444 00111' });

    const exp = (await buildCustomerExport({ accountId, customerId }))!;
    expect(exp.whatsapp_contacts).toHaveLength(0);
    // Everything genuinely theirs is still disclosed.
    expect(exp.conversation_days).toHaveLength(1);
  });

  it('includes audit rows targeting the customer\'s messages and appointments', async () => {
    // Real access events are logged against the touched row, not the customer id:
    // AI reads target the message id, AI tools target the appointment id.
    const [msg] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(eq(messages.accountId, accountId))
      .limit(1);
    const [appt] = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(eq(appointments.accountId, accountId))
      .limit(1);

    await db.insert(auditLog).values([
      {
        accountId,
        actor: 'ai',
        action: 'ai.conversation.read',
        targetTable: 'messages',
        targetId: msg.id,
      },
      {
        accountId,
        actor: 'ai',
        action: 'ai.tool.book_appointment',
        targetTable: 'appointments',
        targetId: appt.id,
      },
      // A message-target row for an unrelated id must stay excluded.
      {
        accountId,
        actor: 'ai',
        action: 'ai.conversation.read',
        targetTable: 'messages',
        targetId: '00000000-0000-0000-0000-000000000000',
      },
    ]);

    const result = await buildCustomerExport({ accountId, customerId });
    const rows = result!.audit_log_entries_for_customer;
    const actions = rows.map((r) => r.action);
    // customer.notes_updated (customers/customerId) + message row + appointment row.
    expect(rows).toHaveLength(3);
    expect(actions).toContain('customer.notes_updated');
    expect(actions).toContain('ai.conversation.read');
    expect(actions).toContain('ai.tool.book_appointment');
  });

  it('returns null for an unknown or cross-tenant customer', async () => {
    expect(
      await buildCustomerExport({
        accountId,
        customerId: '00000000-0000-0000-0000-000000000000',
      }),
    ).toBeNull();
    expect(
      await buildCustomerExport({ accountId: otherAccountId, customerId }),
    ).toBeNull();
  });
});

describe('buildAccountExport', () => {
  it('returns all tables scoped to the PT with the token redacted', async () => {
    const exp = await buildAccountExport(accountId);

    expect(exp.account.id).toBe(accountId);
    expect(exp.customers).toHaveLength(1);
    expect(exp.conversations).toHaveLength(1);
    expect(exp.messages).toHaveLength(1);
    expect(exp.appointments).toHaveLength(1);
    expect(exp.services).toHaveLength(1);
    expect(exp.availability_rules).toHaveLength(1);
    expect(exp.blocked_periods).toHaveLength(1);
    expect(exp.message_templates).toHaveLength(1);
    expect(exp.events).toHaveLength(1);
    expect(exp.billing_orders).toHaveLength(1);
    expect(exp.billing_orders[0].amountMinor).toBe(250_000);
    // Both audit rows of the tenant, not just the customer-scoped one.
    expect(exp.audit_log).toHaveLength(2);

    // Push credentials are metadata-only: the endpoint URL and the keys are
    // capabilities, never disclosed.
    expect(exp.push_subscriptions).toHaveLength(1);
    expect(exp.push_subscriptions[0].userAgent).toBe('Chrome/QA');
    expect(exp.push_subscriptions[0].endpoint).toBe('REDACTED');
    expect(exp.push_subscriptions[0].keys).toBe('REDACTED');
    expect(JSON.stringify(exp)).not.toContain('PUSH_P256DH_SECRET');

    expect(exp.whatsapp_connection).not.toBeNull();
    expect(exp.whatsapp_connection!.accessTokenEncrypted).toBe('REDACTED');
    expect(exp.whatsapp_connection).not.toHaveProperty('access_token_encrypted');

    // Phase 15 columns round-trip: accounts/services via SELECT *, the
    // whatsapp_connections explicit column list via displayPhoneNumber.
    expect(exp.account.fullName).toBe('Dr. Test');
    expect(exp.account.title).toBe('Fizioterapeut');
    expect(exp.account.address).toBe('Rr. Test 1, Tiranë');
    expect(exp.account.assistantPaused).toBe(true);
    expect(exp.services[0].priceLek).toBe(5000);
    expect(exp.whatsapp_connection!.displayPhoneNumber).toBe('+355 69 123 4567');
  });

  it('discloses at least what a single customer of the PT can ask for', async () => {
    // A tenant DSAR that returns less than one of its customers' DSARs is not a
    // subject access response; these tables were simply missing from it.
    const exp = await buildAccountExport(accountId);

    expect(exp.reminder_jobs).toHaveLength(1);
    expect(exp.reminder_jobs[0].responseType).toBe('confirm');
    expect(exp.conversation_days).toHaveLength(1);
    expect(exp.conversation_days[0].monthKey).toBe('2026-07');
    expect(exp.whatsapp_contacts).toHaveLength(1);
    expect(exp.whatsapp_contacts[0].phone).toBe('35544400111');

    // Operational per-tenant tables that were invisible to the subject too.
    expect(exp.wa_message_statuses).toHaveLength(1);
    expect(exp.wa_message_statuses[0].lastStatus).toBe('delivered');
    expect(exp.cost_daily).toHaveLength(1);
    expect(exp.cost_daily[0].day).toBe('2026-07-15');
    expect(exp.pwa_mutations).toHaveLength(1);
    expect(exp.pwa_mutations[0].type).toBe('appointment.book');
  });

  it('produces a JSON-round-trippable object (no Dates or Buffers leak)', async () => {
    const exp = await buildAccountExport(accountId);
    const roundTripped = JSON.parse(JSON.stringify(exp));
    expect(roundTripped).toEqual(exp);
    // No raw token bytes anywhere in the serialized export.
    expect(JSON.stringify(exp)).not.toContain(TOKEN);
  });
});
