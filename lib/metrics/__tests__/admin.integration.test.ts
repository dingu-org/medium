import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  appointments,
  conversations,
  costDaily,
  events,
  messages,
  patients,
  pts,
  whatsappConnections,
} from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { getAdminMetrics } from '@/lib/metrics/admin';

// Fixed evaluation instant. All seeded timestamps live in June 2026 so the
// (past) funnel windows contain only this test's manipulated rows.
const NOW = new Date('2026-06-15T12:00:00.000Z');
const at = (iso: string) => new Date(iso);

type Pt = { id: string; email: string };
const created: Pt[] = [];

async function makeUser(tag: string, createdAt: Date): Promise<Pt> {
  const email = `admin-metrics-${tag}-${Date.now()}-${Math.floor(
    Math.random() * 1e6,
  )}@example.com`;
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email,
    password: 'admin-metrics-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  const id = data.user.id;
  // The signup trigger stamps created_at = now(); override to the test window.
  await db.update(pts).set({ createdAt }).where(eq(pts.id, id));
  const pt = { id, email };
  created.push(pt);
  return pt;
}

async function newPatient(ptId: string): Promise<string> {
  const [pat] = await db
    .insert(patients)
    .values({
      ptId,
      name: 'seed',
      phone: `+49${Date.now()}${Math.floor(Math.random() * 1e6)}`,
    })
    .returning({ id: patients.id });
  return pat.id;
}

async function newConversation(ptId: string, patientId: string): Promise<string> {
  const [conv] = await db
    .insert(conversations)
    .values({ ptId, patientId, channel: 'whatsapp' })
    .returning({ id: conversations.id });
  return conv.id;
}

async function seedMessage(args: {
  ptId: string;
  conversationId: string;
  role: 'ai' | 'patient';
  createdAt: Date;
  model?: string;
  aiCostMicrousd?: number;
}): Promise<void> {
  await db.insert(messages).values({
    ptId: args.ptId,
    conversationId: args.conversationId,
    role: args.role,
    channel: 'whatsapp',
    content: 'x',
    model: args.model ?? null,
    aiCostMicrousd: args.aiCostMicrousd ?? null,
    createdAt: args.createdAt,
  });
}

async function seedConnection(ptId: string, connectedAt: Date): Promise<void> {
  await db.insert(whatsappConnections).values({
    ptId,
    phoneNumberId: `pn-${ptId.slice(0, 8)}-${Date.now()}`,
    wabaId: `w-${ptId.slice(0, 8)}`,
    connectedAt,
    status: 'active',
  });
}

async function seedAppointment(
  ptId: string,
  patientId: string,
  createdAt: Date,
): Promise<void> {
  await db.insert(appointments).values({
    ptId,
    patientId,
    startsAt: at('2026-07-01T10:00:00.000Z'),
    endsAt: at('2026-07-01T11:00:00.000Z'),
    createdAt,
  });
}

async function seedCostDaily(args: {
  ptId: string;
  day: string;
  ai: number;
  meta: number;
}): Promise<void> {
  await db.insert(costDaily).values({
    ptId: args.ptId,
    day: args.day,
    aiCostMicrousd: args.ai,
    metaCostMicroEur: args.meta,
  });
}

async function seedPushEvent(args: {
  ptId: string;
  occurredAt: Date;
  sent: number;
  removed: number;
}): Promise<void> {
  await db.insert(events).values({
    ptId: args.ptId,
    type: 'push.dispatched',
    payload: {
      ptId: args.ptId,
      sourceEvent: 'notification.requested',
      sent: args.sent,
      removed: args.removed,
    },
    occurredAt: args.occurredAt,
  });
}

let ptY: Pt;
let ptWeek: Pt;
// The onboarding cohort counts ALL PTs (no time filter), so other suites' PTs
// can coexist in the row count. Capture a baseline before seeding and assert on
// the delta rather than an absolute total.
let cohortBaseline: { totalPts: number; connectedWithin24h: number };

beforeAll(async () => {
  const base = await getAdminMetrics(NOW);
  cohortBaseline = {
    totalPts: base.cohort.totalPts,
    connectedWithin24h: base.cohort.connectedWithin24h,
  };

  // pt_y — full funnel, all inside "yesterday" (06-14).
  ptY = await makeUser('y', at('2026-06-14T10:00:00.000Z'));
  const yPat1 = await newPatient(ptY.id);
  const yConv1 = await newConversation(ptY.id, yPat1);
  await seedConnection(ptY.id, at('2026-06-14T11:00:00.000Z'));
  await seedMessage({
    ptId: ptY.id,
    conversationId: yConv1,
    role: 'patient',
    createdAt: at('2026-06-14T12:00:00.000Z'),
  });
  await seedAppointment(ptY.id, yPat1, at('2026-06-14T13:00:00.000Z'));
  // pt_y "today" (06-15) live-cost data in a second conversation.
  const yPat2 = await newPatient(ptY.id);
  const yConv2 = await newConversation(ptY.id, yPat2);
  await seedMessage({
    ptId: ptY.id,
    conversationId: yConv2,
    role: 'patient',
    createdAt: at('2026-06-15T08:00:00.000Z'),
  });
  await seedMessage({
    ptId: ptY.id,
    conversationId: yConv2,
    role: 'ai',
    createdAt: at('2026-06-15T09:00:00.000Z'),
    model: 'openai/gpt-4.1-mini',
    aiCostMicrousd: 777,
  });

  // pt_week — inside the 7d window but not "yesterday".
  ptWeek = await makeUser('week', at('2026-06-10T10:00:00.000Z'));
  const wPat = await newPatient(ptWeek.id);
  const wConv = await newConversation(ptWeek.id, wPat);
  await seedConnection(ptWeek.id, at('2026-06-10T11:00:00.000Z'));
  await seedMessage({
    ptId: ptWeek.id,
    conversationId: wConv,
    role: 'patient',
    createdAt: at('2026-06-10T12:00:00.000Z'),
  });
  await seedAppointment(ptWeek.id, wPat, at('2026-06-10T13:00:00.000Z'));

  // pt_boundary — first message BEFORE all windows (06-01) plus an in-window
  // message (06-14). Must NOT count toward ptsWithFirstMessage.
  const ptBoundary = await makeUser('boundary', at('2026-06-01T10:00:00.000Z'));
  const bPat = await newPatient(ptBoundary.id);
  const bConv = await newConversation(ptBoundary.id, bPat);
  await seedMessage({
    ptId: ptBoundary.id,
    conversationId: bConv,
    role: 'patient',
    createdAt: at('2026-06-01T12:00:00.000Z'),
  });
  await seedMessage({
    ptId: ptBoundary.id,
    conversationId: bConv,
    role: 'patient',
    createdAt: at('2026-06-14T12:00:00.000Z'),
  });

  // pt_slow — connected >24h after signup (cohort miss), all before the windows.
  const ptSlow = await makeUser('slow', at('2026-06-05T00:00:00.000Z'));
  await seedConnection(ptSlow.id, at('2026-06-07T00:00:00.000Z'));

  // Cost rollup rows + push events.
  await seedCostDaily({ ptId: ptY.id, day: '2026-06-14', ai: 1000, meta: 60_000 });
  await seedCostDaily({
    ptId: ptWeek.id,
    day: '2026-06-10',
    ai: 500,
    meta: 120_000,
  });
  await seedPushEvent({
    ptId: ptY.id,
    occurredAt: at('2026-06-14T10:00:00.000Z'),
    sent: 3,
    removed: 1,
  });
  await seedPushEvent({
    ptId: ptY.id,
    occurredAt: at('2026-06-12T10:00:00.000Z'),
    sent: 2,
    removed: 0,
  });
  await seedPushEvent({
    ptId: ptY.id,
    occurredAt: at('2026-06-01T10:00:00.000Z'), // out of 7d window
    sent: 99,
    removed: 99,
  });
});

afterAll(async () => {
  const sb = createServiceClient();
  for (const pt of created) await sb.auth.admin.deleteUser(pt.id);
});

describe('getAdminMetrics', () => {
  it('computes the yesterday + 7d funnel windows', async () => {
    const m = await getAdminMetrics(NOW);
    expect(m.funnelYesterday).toEqual({
      signups: 1,
      whatsappConnections: 1,
      ptsWithFirstMessage: 1,
      ptsWithFirstBooking: 1,
    });
    expect(m.funnel7d).toEqual({
      signups: 2,
      whatsappConnections: 2,
      ptsWithFirstMessage: 2,
      ptsWithFirstBooking: 2,
    });
  });

  it('computes the 24h onboarding cohort', async () => {
    const m = await getAdminMetrics(NOW);
    // 4 PTs seeded; 2 connected within 24h (pt_y, pt_week).
    expect(m.cohort.totalPts - cohortBaseline.totalPts).toBe(4);
    expect(m.cohort.connectedWithin24h - cohortBaseline.connectedWithin24h).toBe(
      2,
    );
    // pct is self-consistent with the reported counts.
    expect(m.cohort.pct).toBeCloseTo(
      m.cohort.connectedWithin24h / m.cohort.totalPts,
      9,
    );
  });

  it('reports rolled-up yesterday + current-month cost and today live cost', async () => {
    const m = await getAdminMetrics(NOW);

    const yRow = m.cost.yesterday.find((r) => r.ptId === ptY.id);
    expect(yRow).toMatchObject({
      email: ptY.email,
      aiCostMicrousd: 1000,
      metaCostMicroEur: 60_000,
    });
    expect(m.cost.yesterday.some((r) => r.ptId === ptWeek.id)).toBe(false);

    const monthPtY = m.cost.currentMonth.find((r) => r.ptId === ptY.id);
    const monthPtWeek = m.cost.currentMonth.find((r) => r.ptId === ptWeek.id);
    expect(monthPtY?.aiCostMicrousd).toBe(1000);
    expect(monthPtWeek?.aiCostMicrousd).toBe(500);
    expect(monthPtWeek?.metaCostMicroEur).toBe(120_000);

    const todayPtY = m.cost.today.find((r) => r.ptId === ptY.id);
    expect(todayPtY).toMatchObject({
      aiCostMicrousd: 777,
      metaCostMicroEur: 60_000, // 1 inbound conversation today
    });
  });

  it('aggregates 7d push delivery counts', async () => {
    const m = await getAdminMetrics(NOW);
    expect(m.push).toEqual({ sent: 5, removed: 1, dispatches: 2 });
  });
});
