import { and, eq } from 'drizzle-orm';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// The outbox->Inngest publish is best-effort and tested in the outbox suite;
// here we only assert the DB state machine (plan/service writes + the durable
// `events`/`event_outbox` rows that appendBackgroundEvent writes). Stubbing the
// publisher keeps these tests fast and free of network retries.
vi.mock('@/lib/events/outbox', () => ({
  tryPublishOutboxEvent: vi.fn(async () => {}),
}));

import { db } from '@/lib/db';
import { eventOutbox, events, pts, services } from '@/lib/db/schema';
import {
  loadRenewalCandidates,
  processRenewalForPt,
} from '@/lib/inngest/functions/billing-renewal-monitor';
import { createServiceClient } from '@/lib/supabase/service';
import { testNowUtc } from '@/tests/support/clock';

const DAY = 86_400_000;
let ptId = '';

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `renewal-monitor-${Date.now()}@example.com`,
    password: 'renewal-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  ptId = data.user.id;
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

beforeEach(async () => {
  // Outbox first (FK to events), then events; then reset services + billing.
  await db.delete(eventOutbox).where(eq(eventOutbox.ptId, ptId));
  await db.delete(events).where(eq(events.ptId, ptId));
  await db.delete(services).where(eq(services.ptId, ptId));
  await db
    .update(pts)
    .set({
      plan: 'solo',
      planLifetime: false,
      planExpiresAt: null,
      planDowngradedAt: null,
    })
    .where(eq(pts.id, ptId));
});

async function seedService(name: string, ageDays: number, now: Date) {
  const [row] = await db
    .insert(services)
    .values({
      ptId,
      name,
      durationMin: 30,
      active: true,
      createdAt: new Date(now.getTime() - ageDays * DAY),
    })
    .returning({ id: services.id });
  return row.id;
}

async function downgradeEvents() {
  return db
    .select({ id: events.id })
    .from(events)
    .where(and(eq(events.ptId, ptId), eq(events.type, 'billing.downgraded')));
}

describe('processRenewalForPt — downgrade money path', () => {
  it('downgrades a past-grace Solo, keeps only the oldest active service, emits once', async () => {
    const now = testNowUtc();
    const expiresAt = new Date(now.getTime() - 4 * DAY); // past the 3-day grace
    await db
      .update(pts)
      .set({ plan: 'solo', planExpiresAt: expiresAt })
      .where(eq(pts.id, ptId));

    const oldest = await seedService('oldest', 30, now);
    await seedService('mid', 20, now);
    await seedService('newest', 10, now);

    const outcome = await processRenewalForPt(
      { id: ptId, planExpiresAt: expiresAt },
      now,
    );
    expect(outcome.downgraded).toBe(true);

    const [pt] = await db
      .select({ plan: pts.plan, dg: pts.planDowngradedAt })
      .from(pts)
      .where(eq(pts.id, ptId));
    expect(pt.plan).toBe('free');
    expect(pt.dg).not.toBeNull();

    // Downgrade deletes nothing: all rows remain, only the oldest stays active.
    const rows = await db
      .select({ id: services.id, active: services.active })
      .from(services)
      .where(eq(services.ptId, ptId));
    expect(rows).toHaveLength(3);
    const active = rows.filter((r) => r.active);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(oldest);

    expect(await downgradeEvents()).toHaveLength(1);
    const outbox = await db
      .select({ id: eventOutbox.id })
      .from(eventOutbox)
      .where(eq(eventOutbox.ptId, ptId));
    expect(outbox.length).toBeGreaterThanOrEqual(1);
  });

  it('never downgrades twice — the in-tx re-check is the mutex', async () => {
    const now = testNowUtc();
    const expiresAt = new Date(now.getTime() - 4 * DAY);
    await db
      .update(pts)
      .set({ plan: 'solo', planExpiresAt: expiresAt })
      .where(eq(pts.id, ptId));

    const first = await processRenewalForPt(
      { id: ptId, planExpiresAt: expiresAt },
      now,
    );
    const second = await processRenewalForPt(
      { id: ptId, planExpiresAt: expiresAt },
      now,
    );
    expect(first.downgraded).toBe(true);
    expect(second.downgraded).toBe(false);
    expect(await downgradeEvents()).toHaveLength(1);
  });

  it('skips the downgrade when a renewal landed between scan and write', async () => {
    const now = testNowUtc();
    const staleExpiry = new Date(now.getTime() - 4 * DAY); // what the scan saw
    // The row was renewed (as applyOrderOutcome does): future expiry, cleared
    // downgrade marker. The stale candidate must NOT trigger a downgrade.
    await db
      .update(pts)
      .set({
        plan: 'solo',
        planExpiresAt: new Date(now.getTime() + 20 * DAY),
        planDowngradedAt: null,
      })
      .where(eq(pts.id, ptId));

    const outcome = await processRenewalForPt(
      { id: ptId, planExpiresAt: staleExpiry },
      now,
    );
    expect(outcome.downgraded).toBe(false);

    const [pt] = await db
      .select({ plan: pts.plan })
      .from(pts)
      .where(eq(pts.id, ptId));
    expect(pt.plan).toBe('solo');
    expect(await downgradeEvents()).toHaveLength(0);
  });
});

describe('processRenewalForPt — reminders & grace', () => {
  it('fires both reminders and grace, deduped on re-run', async () => {
    const E = testNowUtc();
    await db
      .update(pts)
      .set({ plan: 'solo', planExpiresAt: E })
      .where(eq(pts.id, ptId));

    // 3 days before expiry → only the 5-day reminder, no grace yet.
    const before = await processRenewalForPt(
      { id: ptId, planExpiresAt: E },
      new Date(E.getTime() - 3 * DAY),
    );
    expect(before.remindersDue).toBe(1);
    expect(before.graceStarted).toBe(false);

    // On the expiry day → the day-0 reminder + grace start.
    const onDay = await processRenewalForPt({ id: ptId, planExpiresAt: E }, E);
    expect(onDay.remindersDue).toBe(1);
    expect(onDay.graceStarted).toBe(true);

    // Both renewal_due rows persisted: offset is part of the dedupe key.
    const renewals = await db
      .select({ payload: events.payload })
      .from(events)
      .where(
        and(eq(events.ptId, ptId), eq(events.type, 'billing.renewal_due')),
      );
    const offsets = renewals
      .map((r) => (r.payload as { offset: number }).offset)
      .sort((a, b) => a - b);
    expect(offsets).toEqual([0, 5]);

    // Same-day re-run → everything already emitted, nothing new fires.
    const rerun = await processRenewalForPt({ id: ptId, planExpiresAt: E }, E);
    expect(rerun.remindersDue).toBe(0);
    expect(rerun.graceStarted).toBe(false);
  });
});

describe('loadRenewalCandidates', () => {
  it('includes non-lifetime Solo PTs with an expiry and excludes the rest', async () => {
    const E = new Date(Date.now() + 10 * DAY);
    await db
      .update(pts)
      .set({ plan: 'solo', planLifetime: false, planExpiresAt: E })
      .where(eq(pts.id, ptId));
    expect((await loadRenewalCandidates()).map((c) => c.id)).toContain(ptId);

    await db.update(pts).set({ planLifetime: true }).where(eq(pts.id, ptId));
    expect((await loadRenewalCandidates()).map((c) => c.id)).not.toContain(
      ptId,
    );

    await db
      .update(pts)
      .set({ planLifetime: false, plan: 'free', planExpiresAt: null })
      .where(eq(pts.id, ptId));
    expect((await loadRenewalCandidates()).map((c) => c.id)).not.toContain(
      ptId,
    );
  });
});
