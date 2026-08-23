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
import { eventOutbox, events, accounts, services } from '@/lib/db/schema';
import {
  loadRenewalCandidates,
  processRenewalForAccount,
} from '@/lib/inngest/functions/billing-renewal-monitor';
import { createServiceClient } from '@/lib/supabase/service';
import { testNowUtc } from '@/tests/support/clock';

const DAY = 86_400_000;
let accountId = '';

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `renewal-monitor-${Date.now()}@example.com`,
    password: 'renewal-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  accountId = data.user.id;
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

beforeEach(async () => {
  // Outbox first (FK to events), then events; then reset services + billing.
  await db.delete(eventOutbox).where(eq(eventOutbox.accountId, accountId));
  await db.delete(events).where(eq(events.accountId, accountId));
  await db.delete(services).where(eq(services.accountId, accountId));
  await db
    .update(accounts)
    .set({
      plan: 'solo',
      planLifetime: false,
      planExpiresAt: null,
      planDowngradedAt: null,
    })
    .where(eq(accounts.id, accountId));
});

async function seedService(name: string, ageDays: number, now: Date) {
  const [row] = await db
    .insert(services)
    .values({
      accountId,
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
    .where(and(eq(events.accountId, accountId), eq(events.type, 'billing.downgraded')));
}

describe('processRenewalForAccount — downgrade money path', () => {
  it('downgrades a past-grace Solo, keeps only the oldest active service, emits once', async () => {
    const now = testNowUtc();
    const expiresAt = new Date(now.getTime() - 4 * DAY); // past the 3-day grace
    await db
      .update(accounts)
      .set({ plan: 'solo', planExpiresAt: expiresAt })
      .where(eq(accounts.id, accountId));

    const oldest = await seedService('oldest', 30, now);
    await seedService('mid', 20, now);
    await seedService('newest', 10, now);

    const outcome = await processRenewalForAccount(
      { id: accountId, planExpiresAt: expiresAt },
      now,
    );
    expect(outcome.downgraded).toBe(true);

    const [account] = await db
      .select({ plan: accounts.plan, dg: accounts.planDowngradedAt })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    expect(account.plan).toBe('free');
    expect(account.dg).not.toBeNull();

    // Downgrade deletes nothing: all rows remain, only the oldest stays active.
    const rows = await db
      .select({ id: services.id, active: services.active })
      .from(services)
      .where(eq(services.accountId, accountId));
    expect(rows).toHaveLength(3);
    const active = rows.filter((r) => r.active);
    expect(active).toHaveLength(1);
    expect(active[0].id).toBe(oldest);

    expect(await downgradeEvents()).toHaveLength(1);
    const outbox = await db
      .select({ id: eventOutbox.id })
      .from(eventOutbox)
      .where(eq(eventOutbox.accountId, accountId));
    expect(outbox.length).toBeGreaterThanOrEqual(1);
  });

  it('never downgrades twice — the in-tx re-check is the mutex', async () => {
    const now = testNowUtc();
    const expiresAt = new Date(now.getTime() - 4 * DAY);
    await db
      .update(accounts)
      .set({ plan: 'solo', planExpiresAt: expiresAt })
      .where(eq(accounts.id, accountId));

    const first = await processRenewalForAccount(
      { id: accountId, planExpiresAt: expiresAt },
      now,
    );
    const second = await processRenewalForAccount(
      { id: accountId, planExpiresAt: expiresAt },
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
      .update(accounts)
      .set({
        plan: 'solo',
        planExpiresAt: new Date(now.getTime() + 20 * DAY),
        planDowngradedAt: null,
      })
      .where(eq(accounts.id, accountId));

    const outcome = await processRenewalForAccount(
      { id: accountId, planExpiresAt: staleExpiry },
      now,
    );
    expect(outcome.downgraded).toBe(false);

    const [account] = await db
      .select({ plan: accounts.plan })
      .from(accounts)
      .where(eq(accounts.id, accountId));
    expect(account.plan).toBe('solo');
    expect(await downgradeEvents()).toHaveLength(0);
  });
});

describe('processRenewalForAccount — reminders & grace', () => {
  it('fires both reminders and grace, deduped on re-run', async () => {
    const E = testNowUtc();
    await db
      .update(accounts)
      .set({ plan: 'solo', planExpiresAt: E })
      .where(eq(accounts.id, accountId));

    // 3 days before expiry → only the 5-day reminder, no grace yet.
    const before = await processRenewalForAccount(
      { id: accountId, planExpiresAt: E },
      new Date(E.getTime() - 3 * DAY),
    );
    expect(before.remindersDue).toBe(1);
    expect(before.graceStarted).toBe(false);

    // On the expiry day → the day-0 reminder + grace start.
    const onDay = await processRenewalForAccount({ id: accountId, planExpiresAt: E }, E);
    expect(onDay.remindersDue).toBe(1);
    expect(onDay.graceStarted).toBe(true);

    // Both renewal_due rows persisted: offset is part of the dedupe key.
    const renewals = await db
      .select({ payload: events.payload })
      .from(events)
      .where(
        and(eq(events.accountId, accountId), eq(events.type, 'billing.renewal_due')),
      );
    const offsets = renewals
      .map((r) => (r.payload as { offset: number }).offset)
      .sort((a, b) => a - b);
    expect(offsets).toEqual([0, 5]);

    // Same-day re-run → everything already emitted, nothing new fires.
    const rerun = await processRenewalForAccount({ id: accountId, planExpiresAt: E }, E);
    expect(rerun.remindersDue).toBe(0);
    expect(rerun.graceStarted).toBe(false);
  });
});

describe('loadRenewalCandidates', () => {
  it('includes non-lifetime Solo PTs with an expiry and excludes the rest', async () => {
    const E = new Date(Date.now() + 10 * DAY);
    await db
      .update(accounts)
      .set({ plan: 'solo', planLifetime: false, planExpiresAt: E })
      .where(eq(accounts.id, accountId));
    expect((await loadRenewalCandidates()).map((c) => c.id)).toContain(accountId);

    await db.update(accounts).set({ planLifetime: true }).where(eq(accounts.id, accountId));
    expect((await loadRenewalCandidates()).map((c) => c.id)).not.toContain(
      accountId,
    );

    await db
      .update(accounts)
      .set({ planLifetime: false, plan: 'free', planExpiresAt: null })
      .where(eq(accounts.id, accountId));
    expect((await loadRenewalCandidates()).map((c) => c.id)).not.toContain(
      accountId,
    );
  });
});
