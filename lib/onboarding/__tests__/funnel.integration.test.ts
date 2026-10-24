import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { accounts, onboardingEvents } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { recordOnboardingEvent } from '../funnel';

let accountId = '';

async function events() {
  return db
    .select()
    .from(onboardingEvents)
    .where(eq(onboardingEvents.accountId, accountId));
}

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `onboarding-funnel-${Date.now()}@example.com`,
    password: 'onboarding-funnel-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Missing user');
  accountId = data.user.id;
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

beforeEach(async () => {
  await db
    .delete(onboardingEvents)
    .where(eq(onboardingEvents.accountId, accountId));
  await db
    .update(accounts)
    .set({ onboardingFlow: 'guided', onboardingCompletedAt: null })
    .where(eq(accounts.id, accountId));
});

describe('recordOnboardingEvent', () => {
  it('a guided account gets one row with the environment and flow version', async () => {
    await recordOnboardingEvent(accountId, 'intro', 'shown');
    const rows = await events();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      step: 'intro',
      outcome: 'shown',
      flowVersion: 1,
      appEnv: 'development',
    });
  });

  it('a repeat leaves one row (first occurrence wins)', async () => {
    await recordOnboardingEvent(accountId, 'intro', 'shown');
    const [first] = await events();
    await Promise.all([
      recordOnboardingEvent(accountId, 'intro', 'shown'),
      recordOnboardingEvent(accountId, 'intro', 'shown'),
    ]);
    const rows = await events();
    expect(rows).toHaveLength(1);
    expect(rows[0].occurredAt).toEqual(first.occurredAt);
  });

  it('a legacy account writes nothing', async () => {
    await db
      .update(accounts)
      .set({ onboardingFlow: 'legacy' })
      .where(eq(accounts.id, accountId));
    await recordOnboardingEvent(accountId, 'intro', 'shown');
    await recordOnboardingEvent(accountId, 'finish', 'completed');
    expect(await events()).toHaveLength(0);
  });

  it('a completed account writes only finish events', async () => {
    await db
      .update(accounts)
      .set({ onboardingCompletedAt: new Date() })
      .where(eq(accounts.id, accountId));
    await recordOnboardingEvent(accountId, 'whatsapp', 'shown');
    expect(await events()).toHaveLength(0);
    await recordOnboardingEvent(accountId, 'finish', 'shown');
    expect(await events()).toHaveLength(1);
  });

  it('an unknown account neither throws nor writes', async () => {
    await expect(
      recordOnboardingEvent(
        '00000000-0000-4000-8000-000000000000',
        'intro',
        'shown',
      ),
    ).resolves.toBeUndefined();
    await expect(
      recordOnboardingEvent('not-a-uuid', 'intro', 'shown'),
    ).resolves.toBeUndefined();
    expect(await events()).toHaveLength(0);
  });
});

describe('onboarding_events schema', () => {
  it('has exactly the content-free columns (no-PII guard)', async () => {
    const rows = await db.execute<{ column_name: string }>(
      sql`select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'onboarding_events'`,
    );
    expect(rows.map((r) => r.column_name).sort()).toEqual([
      'account_id',
      'app_env',
      'flow_version',
      'id',
      'occurred_at',
      'outcome',
      'step',
    ]);
  });

  it('rejects an unknown environment name', async () => {
    await expect(
      db.insert(onboardingEvents).values({
        accountId,
        step: 'intro',
        outcome: 'shown',
        flowVersion: 1,
        appEnv: 'staging',
      }),
    ).rejects.toThrow();
  });

  it('rows go with the account', async () => {
    const { data } = await createServiceClient().auth.admin.createUser({
      email: `onboarding-funnel-del-${Date.now()}@example.com`,
      password: 'onboarding-funnel-pass-1234',
      email_confirm: true,
    });
    const id = data.user!.id;
    await db
      .update(accounts)
      .set({ onboardingFlow: 'guided' })
      .where(eq(accounts.id, id));
    await recordOnboardingEvent(id, 'intro', 'shown');
    await createServiceClient().auth.admin.deleteUser(id);
    const rows = await db
      .select()
      .from(onboardingEvents)
      .where(eq(onboardingEvents.accountId, id));
    expect(rows).toHaveLength(0);
  });
});
