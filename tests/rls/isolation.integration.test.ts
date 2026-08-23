import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { eq } from 'drizzle-orm';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  erasureArchive,
  eventOutbox,
  events,
  messageTemplates,
  messages,
  customers,
  accounts,
  pushSubscriptions,
  pwaMutations,
  reminderDeliveries,
  reminderJobs,
  services,
  waMessageStatuses,
  whatsappConnections,
  whatsappContacts,
} from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';

type SeedDeps = {
  accountId: string;
  customerId: string;
  conversationId: string;
  appointmentId: string;
  eventId: string;
};

const seedFactories: Record<
  string,
  (deps: SeedDeps) => Record<string, unknown>
> = {
  whatsapp_connections: ({ accountId }) => ({
    account_id: accountId,
    phone_number_id: `pn-${accountId.slice(0, 6)}`,
    waba_id: `w-${accountId.slice(0, 6)}`,
  }),
  whatsapp_contacts: ({ accountId }) => ({
    account_id: accountId,
    phone: `+1555${Date.now()}`,
    wa_id: `1555${Date.now()}`,
  }),
  customers: ({ accountId }) => ({
    account_id: accountId,
    name: 'P',
    phone: `+49${Date.now()}`,
  }),
  services: ({ accountId }) => ({
    account_id: accountId,
    name: `service-${Date.now()}-${Math.random()}`,
    duration_min: 30,
  }),
  conversations: ({ accountId, customerId }) => ({
    account_id: accountId,
    customer_id: customerId,
    channel: 'whatsapp',
  }),
  messages: ({ accountId, conversationId }) => ({
    account_id: accountId,
    conversation_id: conversationId,
    role: 'customer',
    channel: 'whatsapp',
    content: 'hello',
  }),
  appointments: ({ accountId, customerId }) => ({
    account_id: accountId,
    customer_id: customerId,
    starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    ends_at: new Date(Date.now() + 90_000_000).toISOString(),
  }),
  availability_rules: ({ accountId }) => ({
    account_id: accountId,
    weekday: 1,
    start_time: '09:00:00',
    end_time: '17:00:00',
  }),
  blocked_periods: ({ accountId }) => ({
    account_id: accountId,
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 3_600_000).toISOString(),
  }),
  message_templates: ({ accountId }) => ({
    account_id: accountId,
    name: `t-${Date.now()}`,
    language: 'en',
    body: 'hello',
  }),
  reminder_jobs: ({ accountId, appointmentId }) => ({
    account_id: accountId,
    appointment_id: appointmentId,
    scheduled_for: new Date().toISOString(),
  }),
  reminder_deliveries: ({ accountId, appointmentId }) => ({
    account_id: accountId,
    appointment_id: appointmentId,
    external_id: `wamid-rls-${Date.now()}-${Math.random()}`,
    delivered_at: new Date().toISOString(),
  }),
  push_subscriptions: ({ accountId }) => ({
    account_id: accountId,
    endpoint: `https://example.test/${Date.now()}`,
    keys: { p256dh: 'x', auth: 'y' },
  }),
  pwa_mutations: ({ accountId }) => ({
    account_id: accountId,
    client_mutation_id: `rls-${Date.now()}-${Math.random()}`,
    type: 'test',
    status: 'success',
  }),
  events: ({ accountId }) => ({ account_id: accountId, type: 'test', payload: {} }),
  event_outbox: ({ accountId, eventId }) => ({
    account_id: accountId,
    event_id: eventId,
    event_type: 'test',
    payload: {},
  }),
  audit_log: ({ accountId }) => ({
    account_id: accountId,
    actor: 'service',
    action: 'a',
    target_table: 'customers',
  }),
  cost_daily: ({ accountId }) => ({
    account_id: accountId,
    day: new Date().toISOString().slice(0, 10),
  }),
  conversation_days: ({ accountId, customerId, conversationId }) => ({
    account_id: accountId,
    customer_id: customerId,
    conversation_id: conversationId,
    local_day: new Date().toISOString().slice(0, 10),
    month_key: new Date().toISOString().slice(0, 7),
  }),
  erasure_archive: ({ accountId }) => ({ account_id: accountId, scope: 'account' }),
  wa_message_statuses: ({ accountId }) => ({
    account_id: accountId,
    external_id: `wamid-${Date.now()}-${Math.random()}`,
    last_status: 'sent',
  }),
  billing_orders: ({ accountId }) => ({
    account_id: accountId,
    pok_order_id: `pok-${Date.now()}-${Math.random()}`,
    plan: 'solo',
    period: 'monthly',
    amount_minor: 250000,
    currency: 'ALL',
    status: 'created',
  }),
};

// A real single-column write per table. `.update({})` builds no SET clause, so
// PostgREST issues no statement at all and the assertions would hold under any
// policy — including a deny-all one. Every matrix table needs an entry (asserted
// below) so a new table cannot silently skip the write checks.
const UPDATE_COL: Record<string, Record<string, unknown>> = {
  whatsapp_connections: { tier: 'rls-probe' },
  whatsapp_contacts: { full_name: 'rls-probe' },
  customers: { notes: 'rls-probe' },
  services: { active: false },
  conversations: { escalation_state: 'rls-probe' },
  messages: { model: 'rls-probe' },
  appointments: { notes: 'rls-probe' },
  availability_rules: { weekday: 2 },
  blocked_periods: { label: 'rls-probe' },
  message_templates: { meta_id: 'rls-probe' },
  reminder_jobs: { last_error: 'rls-probe' },
  // Not external_id: a unique-violation would satisfy the "rejected" assertion
  // without the privilege check ever being the reason.
  reminder_deliveries: { delivered_at: new Date(0).toISOString() },
  push_subscriptions: { user_agent: 'rls-probe' },
  pwa_mutations: { error: 'rls-probe' },
  events: { type: 'rls-probe' },
  event_outbox: { last_error: 'rls-probe' },
  audit_log: { action: 'rls-probe' },
  cost_daily: { meta_cost_source: 'rls-probe' },
  conversation_days: { month_key: '1970-01' },
  erasure_archive: { before_state_hash: 'rls-probe' },
  wa_message_statuses: { pricing_category: 'rls-probe' },
  billing_orders: { currency: 'XXX' },
};

// Operator-only tables: their policy is USING (false), so even the owning tenant
// reads nothing (0016 erasure_archive, 0021 wa_message_statuses, 0026
// reminder_deliveries).
const DENY_ALL = new Set([
  'erasure_archive',
  'wa_message_statuses',
  'reminder_deliveries',
]);

const TENANT_ID_COL: Record<string, 'account_id' | 'id'> = { accounts: 'id' };

// Mirrors the allowlist in coverage.integration.test.ts: tables in `public` that
// legitimately carry no tenant column. Enumerating "has a account_id column" instead
// would let a future shared table skip this whole matrix unnoticed.
const NON_TENANT_TABLES = new Set<string>();

let sql: ReturnType<typeof postgres>;
let accountIdA = '';
let accountIdB = '';
let depsA: SeedDeps;
let userClientA: SupabaseClient;

async function makeUser(stamp: string): Promise<string> {
  const sb = createServiceClient();
  const { data, error } = await sb.auth.admin.createUser({
    email: `iso-${stamp}@example.com`,
    password: 'iso-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user)
    throw new Error(`createUser ${stamp}: ${error?.message}`);
  return data.user.id;
}

async function seedFor(accountId: string): Promise<SeedDeps> {
  const [pat] = await db
    .insert(customers)
    .values({ accountId, name: 'seed', phone: `+49${Date.now()}${Math.random()}` })
    .returning({ id: customers.id });
  const [conv] = await db
    .insert(conversations)
    .values({ accountId, customerId: pat.id, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  const [appt] = await db
    .insert(appointments)
    .values({
      accountId,
      customerId: pat.id,
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 90_000_000),
    })
    .returning({ id: appointments.id });

  // Seed one row per other tenant-scoped table for B (so SELECT/UPDATE/DELETE have something to filter against).
  await db.insert(whatsappConnections).values({
    accountId,
    phoneNumberId: `pn-${accountId.slice(0, 6)}`,
    wabaId: `w-${accountId.slice(0, 6)}`,
  });
  await db.insert(whatsappContacts).values({
    accountId,
    phone: `+1555${Date.now()}${Math.random()}`,
    waId: `1555${Date.now()}${Math.random()}`,
  });
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
    name: `t-${Date.now()}-${Math.random()}`,
    language: 'en',
    body: 'hi',
  });
  await db.insert(reminderJobs).values({
    accountId,
    appointmentId: appt.id,
    scheduledFor: new Date(),
  });
  await db.insert(reminderDeliveries).values({
    accountId,
    appointmentId: appt.id,
    externalId: `wamid-seed-${Date.now()}-${Math.random()}`,
    deliveredAt: new Date(),
  });
  await db.insert(services).values({
    accountId,
    name: `service-${Date.now()}-${Math.random()}`,
    durationMin: 30,
  });
  await db.insert(messages).values({
    accountId,
    conversationId: conv.id,
    role: 'customer',
    channel: 'whatsapp',
    content: 'seed',
  });
  await db.insert(pushSubscriptions).values({
    accountId,
    endpoint: `https://example.test/${Date.now()}-${Math.random()}`,
    keys: { p256dh: 'x', auth: 'y' },
  });
  await db.insert(pwaMutations).values({
    accountId,
    clientMutationId: `seed-${Date.now()}-${Math.random()}`,
    type: 'seed',
    status: 'success',
  });
  const [event] = await db
    .insert(events)
    .values({ accountId, type: 'seed', payload: {} })
    .returning({ id: events.id });
  await db.insert(eventOutbox).values({
    accountId,
    eventId: event.id,
    eventType: 'seed',
    payload: {},
  });
  await db.insert(auditLog).values({
    accountId,
    actor: 'svc',
    action: 'seed',
    targetTable: 'customers',
  });
  await db.insert(erasureArchive).values({ accountId, scope: 'account' });
  await db.insert(waMessageStatuses).values({
    accountId,
    externalId: `wamid-${Date.now()}-${Math.random()}`,
    lastStatus: 'sent',
  });
  await db.insert(costDaily).values({
    accountId,
    day: new Date().toISOString().slice(0, 10),
  });
  await db.insert(conversationDays).values({
    accountId,
    customerId: pat.id,
    conversationId: conv.id,
    localDay: new Date().toISOString().slice(0, 10),
    monthKey: new Date().toISOString().slice(0, 7),
  });
  await db.insert(billingOrders).values({
    accountId,
    pokOrderId: `pok-${Date.now()}-${Math.random()}`,
    plan: 'solo',
    period: 'monthly',
    amountMinor: 250000,
    currency: 'ALL',
  });

  return {
    accountId,
    customerId: pat.id,
    conversationId: conv.id,
    appointmentId: appt.id,
    eventId: event.id,
  };
}

beforeAll(async () => {
  sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  const stamp = `${Date.now()}`;
  accountIdA = await makeUser(`a-${stamp}`);
  accountIdB = await makeUser(`b-${stamp}`);
  depsA = await seedFor(accountIdA);
  await seedFor(accountIdB);

  userClientA = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
  );
  const { error } = await userClientA.auth.signInWithPassword({
    email: `iso-a-${stamp}@example.com`,
    password: 'iso-pass-1234',
  });
  if (error) throw error;
});

afterAll(async () => {
  const sb = createServiceClient();
  if (accountIdA) await sb.auth.admin.deleteUser(accountIdA);
  if (accountIdB) await sb.auth.admin.deleteUser(accountIdB);
  await sql.end({ timeout: 1 });
});

async function tenantTablesFromDb(): Promise<string[]> {
  const rows = await sql<{ relname: string }[]>`
    SELECT relname
    FROM pg_class
    WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
    ORDER BY relname
  `;
  return rows.map((r) => r.relname).filter((t) => !NON_TENANT_TABLES.has(t));
}

describe('RLS isolation registry covers every tenant-scoped table', () => {
  it('seedFactories covers every table in public (accounts handled separately)', async () => {
    const dbTables = (await tenantTablesFromDb()).filter((t) => t !== 'accounts');
    const registered = Object.keys(seedFactories).sort();
    expect(registered).toEqual(dbTables.sort());
  });

  it('UPDATE_COL has a real column for every matrix table', () => {
    expect(Object.keys(UPDATE_COL).sort()).toEqual(
      Object.keys(seedFactories).sort(),
    );
  });
});

const matrixTables = Object.keys(seedFactories);

describe.each(matrixTables)('RLS isolation: %s', (table) => {
  const tenantCol = TENANT_ID_COL[table] ?? 'account_id';
  const patch = UPDATE_COL[table];

  // Positive canary: without it a deny-all policy (or a dropped policy) would
  // pass every negative case below. Realtime postgres_changes needs exactly this
  // read to keep delivering, so it must never regress.
  it("SELECT as A returns A's own rows", async () => {
    const { data, error } = await userClientA
      .from(table)
      .select('*')
      .eq(tenantCol, accountIdA);
    expect(error).toBeNull();
    if (DENY_ALL.has(table)) {
      expect(data).toEqual([]);
    } else {
      expect(data?.length ?? 0).toBeGreaterThanOrEqual(1);
    }
  });

  it('SELECT as A returns 0 rows for B', async () => {
    const { data, error } = await userClientA
      .from(table)
      .select('*')
      .eq(tenantCol, accountIdB);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  // Writes are revoked for anon/authenticated (0024) and no policy allows them,
  // so PostgREST must reject every write — including the tenant's own rows. All
  // app writes go through the owner connection in lib/db, never PostgREST.
  it("INSERT is rejected for A's own tenant and for B", async () => {
    const own = await userClientA
      .from(table)
      .insert(seedFactories[table](depsA));
    expect(own.error).not.toBeNull();

    const other = await userClientA
      .from(table)
      .insert(seedFactories[table]({ ...depsA, accountId: accountIdB }));
    expect(other.error).not.toBeNull();
  });

  it("UPDATE of a real column is rejected for A's own rows and for B", async () => {
    const own = await userClientA
      .from(table)
      .update(patch)
      .eq(tenantCol, accountIdA)
      .select();
    expect(own.error).not.toBeNull();

    const other = await userClientA
      .from(table)
      .update(patch)
      .eq(tenantCol, accountIdB)
      .select();
    expect(other.error).not.toBeNull();
  });

  it("DELETE is rejected for A's own rows and for B", async () => {
    const own = await userClientA
      .from(table)
      .delete()
      .eq(tenantCol, accountIdA)
      .select();
    expect(own.error).not.toBeNull();

    const other = await userClientA
      .from(table)
      .delete()
      .eq(tenantCol, accountIdB)
      .select();
    expect(other.error).not.toBeNull();
  });
});

describe('RLS isolation: accounts', () => {
  it("SELECT as A returns A's own accounts row", async () => {
    const { data, error } = await userClientA
      .from('accounts')
      .select('*')
      .eq('id', accountIdA);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(1);
  });

  it("SELECT as A returns 0 rows for B's accounts row", async () => {
    const { data, error } = await userClientA
      .from('accounts')
      .select('*')
      .eq('id', accountIdB);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("UPDATE filtered by B's id is rejected", async () => {
    const { error } = await userClientA
      .from('accounts')
      .update({ name: 'hijack' })
      .eq('id', accountIdB)
      .select();
    expect(error).not.toBeNull();
  });

  // The entitlement fields live on the tenant's own row, so a writable accounts row
  // is a free upgrade to the paid plan (lib/billing/entitlements.ts trusts them)
  // and `retention_days` defeats the GDPR purge.
  it('UPDATE of own plan/retention fields is rejected', async () => {
    for (const patch of [
      { plan: 'solo' },
      { plan_lifetime: true },
      { plan_expires_at: new Date(Date.now() + 86_400_000).toISOString() },
      { retention_days: 99_999 },
    ]) {
      const { error } = await userClientA
        .from('accounts')
        .update(patch)
        .eq('id', accountIdA)
        .select();
      expect(error).not.toBeNull();
    }

    const [row] = await db
      .select({ plan: accounts.plan, planLifetime: accounts.planLifetime })
      .from(accounts)
      .where(eq(accounts.id, accountIdA));
    expect(row.plan).toBe('free');
    expect(row.planLifetime).toBe(false);
  });
});
