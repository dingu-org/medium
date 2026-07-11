import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  appointments,
  auditLog,
  availabilityRules,
  blockedPeriods,
  conversations,
  erasureArchive,
  eventOutbox,
  events,
  messageTemplates,
  messages,
  patients,
  pushSubscriptions,
  pwaMutations,
  reminderJobs,
  services,
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
  erasure_archive: ({ ptId }) => ({ pt_id: ptId, scope: 'account' }),
};

const TENANT_ID_COL: Record<string, 'pt_id' | 'id'> = { pts: 'id' };

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
  const rows = await sql<{ table_name: string }[]>`
    SELECT DISTINCT table_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'pt_id'
    UNION
    SELECT 'pts'::text
    ORDER BY table_name
  `;
  return rows.map((r) => r.table_name);
}

describe('RLS isolation registry covers every tenant-scoped table', () => {
  it('seedFactories covers all pt_id-bearing tables (pts handled separately)', async () => {
    const dbTables = (await tenantTablesFromDb()).filter((t) => t !== 'pts');
    const registered = Object.keys(seedFactories).sort();
    expect(registered).toEqual(dbTables.sort());
  });
});

const matrixTables = Object.keys(seedFactories);

describe.each(matrixTables)('RLS isolation: %s', (table) => {
  const tenantCol = TENANT_ID_COL[table] ?? 'pt_id';

  it('SELECT as A returns 0 rows for B', async () => {
    const { data, error } = await userClientA
      .from(table)
      .select('*')
      .eq(tenantCol, ptIdB);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('INSERT with B as tenant fails RLS', async () => {
    const row = seedFactories[table]({ ...depsA, ptId: ptIdB });
    const { error } = await userClientA.from(table).insert(row);
    expect(error).not.toBeNull();
  });

  it('UPDATE filtered by B affects 0 rows', async () => {
    const { data, error } = await userClientA
      .from(table)
      .update({})
      .eq(tenantCol, ptIdB)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('DELETE filtered by B affects 0 rows', async () => {
    const { data, error } = await userClientA
      .from(table)
      .delete()
      .eq(tenantCol, ptIdB)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe('RLS isolation: pts', () => {
  it("SELECT as A returns 0 rows for B's pts row", async () => {
    const { data, error } = await userClientA
      .from('pts')
      .select('*')
      .eq('id', ptIdB);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("UPDATE filtered by B's id affects 0 rows", async () => {
    const { data, error } = await userClientA
      .from('pts')
      .update({ practice_name: 'hijack' })
      .eq('id', ptIdB)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
