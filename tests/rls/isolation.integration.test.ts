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
  patients,
  pts,
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
  ptId: string;
  patientId: string;
  conversationId: string;
  appointmentId: string;
  eventId: string;
};

const seedFactories: Record<
  string,
  (deps: SeedDeps) => Record<string, unknown>
> = {
  whatsapp_connections: ({ ptId }) => ({
    pt_id: ptId,
    phone_number_id: `pn-${ptId.slice(0, 6)}`,
    waba_id: `w-${ptId.slice(0, 6)}`,
  }),
  whatsapp_contacts: ({ ptId }) => ({
    pt_id: ptId,
    phone: `+1555${Date.now()}`,
    wa_id: `1555${Date.now()}`,
  }),
  patients: ({ ptId }) => ({
    pt_id: ptId,
    name: 'P',
    phone: `+49${Date.now()}`,
  }),
  services: ({ ptId }) => ({
    pt_id: ptId,
    name: `service-${Date.now()}-${Math.random()}`,
    duration_min: 30,
  }),
  conversations: ({ ptId, patientId }) => ({
    pt_id: ptId,
    patient_id: patientId,
    channel: 'whatsapp',
  }),
  messages: ({ ptId, conversationId }) => ({
    pt_id: ptId,
    conversation_id: conversationId,
    role: 'patient',
    channel: 'whatsapp',
    content: 'hello',
  }),
  appointments: ({ ptId, patientId }) => ({
    pt_id: ptId,
    patient_id: patientId,
    starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    ends_at: new Date(Date.now() + 90_000_000).toISOString(),
  }),
  availability_rules: ({ ptId }) => ({
    pt_id: ptId,
    weekday: 1,
    start_time: '09:00:00',
    end_time: '17:00:00',
  }),
  blocked_periods: ({ ptId }) => ({
    pt_id: ptId,
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 3_600_000).toISOString(),
  }),
  message_templates: ({ ptId }) => ({
    pt_id: ptId,
    name: `t-${Date.now()}`,
    language: 'en',
    body: 'hello',
  }),
  reminder_jobs: ({ ptId, appointmentId }) => ({
    pt_id: ptId,
    appointment_id: appointmentId,
    scheduled_for: new Date().toISOString(),
  }),
  reminder_deliveries: ({ ptId, appointmentId }) => ({
    pt_id: ptId,
    appointment_id: appointmentId,
    external_id: `wamid-rls-${Date.now()}-${Math.random()}`,
    delivered_at: new Date().toISOString(),
  }),
  push_subscriptions: ({ ptId }) => ({
    pt_id: ptId,
    endpoint: `https://example.test/${Date.now()}`,
    keys: { p256dh: 'x', auth: 'y' },
  }),
  pwa_mutations: ({ ptId }) => ({
    pt_id: ptId,
    client_mutation_id: `rls-${Date.now()}-${Math.random()}`,
    type: 'test',
    status: 'success',
  }),
  events: ({ ptId }) => ({ pt_id: ptId, type: 'test', payload: {} }),
  event_outbox: ({ ptId, eventId }) => ({
    pt_id: ptId,
    event_id: eventId,
    event_type: 'test',
    payload: {},
  }),
  audit_log: ({ ptId }) => ({
    pt_id: ptId,
    actor: 'service',
    action: 'a',
    target_table: 'patients',
  }),
  cost_daily: ({ ptId }) => ({
    pt_id: ptId,
    day: new Date().toISOString().slice(0, 10),
  }),
  conversation_days: ({ ptId, patientId, conversationId }) => ({
    pt_id: ptId,
    patient_id: patientId,
    conversation_id: conversationId,
    local_day: new Date().toISOString().slice(0, 10),
    month_key: new Date().toISOString().slice(0, 7),
  }),
  erasure_archive: ({ ptId }) => ({ pt_id: ptId, scope: 'account' }),
  wa_message_statuses: ({ ptId }) => ({
    pt_id: ptId,
    external_id: `wamid-${Date.now()}-${Math.random()}`,
    last_status: 'sent',
  }),
  billing_orders: ({ ptId }) => ({
    pt_id: ptId,
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
  patients: { notes: 'rls-probe' },
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

const TENANT_ID_COL: Record<string, 'pt_id' | 'id'> = { pts: 'id' };

// Mirrors the allowlist in coverage.integration.test.ts: tables in `public` that
// legitimately carry no tenant column. Enumerating "has a pt_id column" instead
// would let a future shared table skip this whole matrix unnoticed.
const NON_TENANT_TABLES = new Set<string>();

let sql: ReturnType<typeof postgres>;
let ptIdA = '';
let ptIdB = '';
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

async function seedFor(ptId: string): Promise<SeedDeps> {
  const [pat] = await db
    .insert(patients)
    .values({ ptId, name: 'seed', phone: `+49${Date.now()}${Math.random()}` })
    .returning({ id: patients.id });
  const [conv] = await db
    .insert(conversations)
    .values({ ptId, patientId: pat.id, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  const [appt] = await db
    .insert(appointments)
    .values({
      ptId,
      patientId: pat.id,
      startsAt: new Date(Date.now() + 86_400_000),
      endsAt: new Date(Date.now() + 90_000_000),
    })
    .returning({ id: appointments.id });

  // Seed one row per other tenant-scoped table for B (so SELECT/UPDATE/DELETE have something to filter against).
  await db.insert(whatsappConnections).values({
    ptId,
    phoneNumberId: `pn-${ptId.slice(0, 6)}`,
    wabaId: `w-${ptId.slice(0, 6)}`,
  });
  await db.insert(whatsappContacts).values({
    ptId,
    phone: `+1555${Date.now()}${Math.random()}`,
    waId: `1555${Date.now()}${Math.random()}`,
  });
  await db.insert(availabilityRules).values({
    ptId,
    weekday: 1,
    startTime: '09:00:00',
    endTime: '17:00:00',
  });
  await db.insert(blockedPeriods).values({
    ptId,
    startsAt: new Date(),
    endsAt: new Date(Date.now() + 3_600_000),
  });
  await db.insert(messageTemplates).values({
    ptId,
    name: `t-${Date.now()}-${Math.random()}`,
    language: 'en',
    body: 'hi',
  });
  await db.insert(reminderJobs).values({
    ptId,
    appointmentId: appt.id,
    scheduledFor: new Date(),
  });
  await db.insert(reminderDeliveries).values({
    ptId,
    appointmentId: appt.id,
    externalId: `wamid-seed-${Date.now()}-${Math.random()}`,
    deliveredAt: new Date(),
  });
  await db.insert(services).values({
    ptId,
    name: `service-${Date.now()}-${Math.random()}`,
    durationMin: 30,
  });
  await db.insert(messages).values({
    ptId,
    conversationId: conv.id,
    role: 'patient',
    channel: 'whatsapp',
    content: 'seed',
  });
  await db.insert(pushSubscriptions).values({
    ptId,
    endpoint: `https://example.test/${Date.now()}-${Math.random()}`,
    keys: { p256dh: 'x', auth: 'y' },
  });
  await db.insert(pwaMutations).values({
    ptId,
    clientMutationId: `seed-${Date.now()}-${Math.random()}`,
    type: 'seed',
    status: 'success',
  });
  const [event] = await db
    .insert(events)
    .values({ ptId, type: 'seed', payload: {} })
    .returning({ id: events.id });
  await db.insert(eventOutbox).values({
    ptId,
    eventId: event.id,
    eventType: 'seed',
    payload: {},
  });
  await db.insert(auditLog).values({
    ptId,
    actor: 'svc',
    action: 'seed',
    targetTable: 'patients',
  });
  await db.insert(erasureArchive).values({ ptId, scope: 'account' });
  await db.insert(waMessageStatuses).values({
    ptId,
    externalId: `wamid-${Date.now()}-${Math.random()}`,
    lastStatus: 'sent',
  });
  await db.insert(costDaily).values({
    ptId,
    day: new Date().toISOString().slice(0, 10),
  });
  await db.insert(conversationDays).values({
    ptId,
    patientId: pat.id,
    conversationId: conv.id,
    localDay: new Date().toISOString().slice(0, 10),
    monthKey: new Date().toISOString().slice(0, 7),
  });
  await db.insert(billingOrders).values({
    ptId,
    pokOrderId: `pok-${Date.now()}-${Math.random()}`,
    plan: 'solo',
    period: 'monthly',
    amountMinor: 250000,
    currency: 'ALL',
  });

  return {
    ptId,
    patientId: pat.id,
    conversationId: conv.id,
    appointmentId: appt.id,
    eventId: event.id,
  };
}

beforeAll(async () => {
  sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });

  const stamp = `${Date.now()}`;
  ptIdA = await makeUser(`a-${stamp}`);
  ptIdB = await makeUser(`b-${stamp}`);
  depsA = await seedFor(ptIdA);
  await seedFor(ptIdB);

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
  if (ptIdA) await sb.auth.admin.deleteUser(ptIdA);
  if (ptIdB) await sb.auth.admin.deleteUser(ptIdB);
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
  it('seedFactories covers every table in public (pts handled separately)', async () => {
    const dbTables = (await tenantTablesFromDb()).filter((t) => t !== 'pts');
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
  const tenantCol = TENANT_ID_COL[table] ?? 'pt_id';
  const patch = UPDATE_COL[table];

  // Positive canary: without it a deny-all policy (or a dropped policy) would
  // pass every negative case below. Realtime postgres_changes needs exactly this
  // read to keep delivering, so it must never regress.
  it("SELECT as A returns A's own rows", async () => {
    const { data, error } = await userClientA
      .from(table)
      .select('*')
      .eq(tenantCol, ptIdA);
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
      .eq(tenantCol, ptIdB);
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
      .insert(seedFactories[table]({ ...depsA, ptId: ptIdB }));
    expect(other.error).not.toBeNull();
  });

  it("UPDATE of a real column is rejected for A's own rows and for B", async () => {
    const own = await userClientA
      .from(table)
      .update(patch)
      .eq(tenantCol, ptIdA)
      .select();
    expect(own.error).not.toBeNull();

    const other = await userClientA
      .from(table)
      .update(patch)
      .eq(tenantCol, ptIdB)
      .select();
    expect(other.error).not.toBeNull();
  });

  it("DELETE is rejected for A's own rows and for B", async () => {
    const own = await userClientA
      .from(table)
      .delete()
      .eq(tenantCol, ptIdA)
      .select();
    expect(own.error).not.toBeNull();

    const other = await userClientA
      .from(table)
      .delete()
      .eq(tenantCol, ptIdB)
      .select();
    expect(other.error).not.toBeNull();
  });
});

describe('RLS isolation: pts', () => {
  it("SELECT as A returns A's own pts row", async () => {
    const { data, error } = await userClientA
      .from('pts')
      .select('*')
      .eq('id', ptIdA);
    expect(error).toBeNull();
    expect(data?.length ?? 0).toBe(1);
  });

  it("SELECT as A returns 0 rows for B's pts row", async () => {
    const { data, error } = await userClientA
      .from('pts')
      .select('*')
      .eq('id', ptIdB);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("UPDATE filtered by B's id is rejected", async () => {
    const { error } = await userClientA
      .from('pts')
      .update({ practice_name: 'hijack' })
      .eq('id', ptIdB)
      .select();
    expect(error).not.toBeNull();
  });

  // The entitlement fields live on the tenant's own row, so a writable pts row
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
        .from('pts')
        .update(patch)
        .eq('id', ptIdA)
        .select();
      expect(error).not.toBeNull();
    }

    const [row] = await db
      .select({ plan: pts.plan, planLifetime: pts.planLifetime })
      .from(pts)
      .where(eq(pts.id, ptIdA));
    expect(row.plan).toBe('free');
    expect(row.planLifetime).toBe(false);
  });
});
