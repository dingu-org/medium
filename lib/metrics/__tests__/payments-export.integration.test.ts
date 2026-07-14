import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { billingOrders } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import {
  buildPaymentsCsv,
  loadPaymentsForMonth,
  type PaymentExportRow,
} from '@/lib/metrics/payments-export';

// Unique per-run tag so pok_order_ids never collide with other suites / the
// concurrent C6 agent sharing this DB, and so we can filter the (global) query
// result down to exactly the rows this test seeded.
const TAG = `pexport-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const at = (iso: string) => new Date(iso);

type Pt = { id: string; email: string };
const created: Pt[] = [];

async function makeUser(tag: string): Promise<Pt> {
  const email = `${TAG}-${tag}@example.com`;
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email,
    password: 'payments-export-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  const pt = { id: data.user.id, email };
  created.push(pt);
  return pt;
}

async function seedOrder(args: {
  ptId: string;
  key: string;
  status: 'created' | 'paid' | 'failed' | 'expired';
  plan?: 'free' | 'solo';
  period?: 'monthly' | 'yearly';
  amountMinor: number;
  currency?: string;
  createdAt: Date;
  paidAt?: Date | null;
  previousExpiresAt?: Date | null;
  newExpiresAt?: Date | null;
}): Promise<void> {
  await db.insert(billingOrders).values({
    ptId: args.ptId,
    pokOrderId: `${TAG}-${args.key}`,
    plan: args.plan ?? 'solo',
    period: args.period ?? 'monthly',
    amountMinor: args.amountMinor,
    currency: args.currency ?? 'ALL',
    status: args.status,
    createdAt: args.createdAt,
    paidAt: args.paidAt ?? null,
    previousExpiresAt: args.previousExpiresAt ?? null,
    newExpiresAt: args.newExpiresAt ?? null,
  });
}

const mine = (rows: PaymentExportRow[]): PaymentExportRow[] =>
  rows.filter((r) => r.pokOrderId.startsWith(`${TAG}-`));

let ptA: Pt;
let ptB: Pt;
let ptC: Pt;
let ptD: Pt;

beforeAll(async () => {
  ptA = await makeUser('a');
  ptB = await makeUser('b');
  ptC = await makeUser('c');
  ptD = await makeUser('d');

  // Two April paid orders (a before b by paid_at) — the fiscal rows.
  await seedOrder({
    ptId: ptA.id,
    key: 'a',
    status: 'paid',
    amountMinor: 250000,
    createdAt: at('2026-04-09T08:00:00.000Z'),
    paidAt: at('2026-04-10T10:00:00.000Z'),
    newExpiresAt: at('2026-05-10T10:00:00.000Z'),
  });
  await seedOrder({
    ptId: ptB.id,
    key: 'b',
    status: 'paid',
    period: 'yearly',
    amountMinor: 25000,
    createdAt: at('2026-04-19T08:00:00.000Z'),
    paidAt: at('2026-04-20T10:00:00.000Z'),
    newExpiresAt: at('2027-04-20T10:00:00.000Z'),
  });
  // April created-but-unpaid order — excluded from the paid view, present in ?all.
  await seedOrder({
    ptId: ptC.id,
    key: 'c',
    status: 'created',
    amountMinor: 250000,
    createdAt: at('2026-04-15T08:00:00.000Z'),
    paidAt: null,
  });
  // A May paid order — must not leak into the April query.
  await seedOrder({
    ptId: ptD.id,
    key: 'd',
    status: 'paid',
    amountMinor: 250000,
    createdAt: at('2026-05-04T08:00:00.000Z'),
    paidAt: at('2026-05-05T10:00:00.000Z'),
    newExpiresAt: at('2026-06-05T10:00:00.000Z'),
  });
});

afterAll(async () => {
  const sb = createServiceClient();
  for (const pt of created) await sb.auth.admin.deleteUser(pt.id);
});

describe('loadPaymentsForMonth', () => {
  it('returns only paid_at-in-month paid rows, joined to email, ordered by paid_at', async () => {
    const rows = mine(await loadPaymentsForMonth('2026-04'));
    expect(rows.map((r) => r.pokOrderId)).toEqual([`${TAG}-a`, `${TAG}-b`]);
    expect(rows[0]).toMatchObject({
      ptEmail: ptA.email,
      ptId: ptA.id,
      amountMinor: 250000,
      currency: 'ALL',
      status: 'paid',
      paidAt: '2026-04-10T10:00:00.000Z',
    });
    expect(rows[1]).toMatchObject({
      ptEmail: ptB.email,
      period: 'yearly',
      amountMinor: 25000,
    });
  });

  it('excludes unpaid orders and other months from the paid view', async () => {
    const rows = mine(await loadPaymentsForMonth('2026-04'));
    const keys = rows.map((r) => r.pokOrderId);
    expect(keys).not.toContain(`${TAG}-c`); // unpaid
    expect(keys).not.toContain(`${TAG}-d`); // May
  });

  it('?all keys on created_at and includes every status, ordered by created_at', async () => {
    const rows = mine(await loadPaymentsForMonth('2026-04', { all: true }));
    // a (04-09), c (04-15), b (04-19) by created_at; d is May.
    expect(rows.map((r) => r.pokOrderId)).toEqual([
      `${TAG}-a`,
      `${TAG}-c`,
      `${TAG}-b`,
    ]);
    expect(rows.find((r) => r.pokOrderId === `${TAG}-c`)?.status).toBe('created');
  });

  it('feeds buildPaymentsCsv content for the month', async () => {
    const rows = mine(await loadPaymentsForMonth('2026-04'));
    const csv = buildPaymentsCsv(rows);
    const lines = csv.split('\r\n');
    expect(lines[0]).toBe(
      'paid_at,created_at,pt_email,pt_id,plan,period,amount_minor_units,currency,status,pok_order_id,previous_expires_at,new_expires_at',
    );
    expect(lines).toHaveLength(3); // header + 2 paid rows
    expect(lines[1]).toContain(ptA.email);
    expect(lines[1]).toContain('250000');
    expect(lines[1]).toContain(`${TAG}-a`);
    expect(lines[2]).toContain(ptB.email);
  });
});
