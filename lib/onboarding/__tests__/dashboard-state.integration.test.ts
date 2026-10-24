import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { accounts, whatsappConnections } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { getDashboardOnboardingState } from '../dashboard-state';

let accountId = '';

async function setAccount(
  flow: 'legacy' | 'guided',
  completed: boolean,
): Promise<void> {
  await db
    .update(accounts)
    .set({
      onboardingFlow: flow,
      onboardingCompletedAt: completed ? new Date() : null,
    })
    .where(eq(accounts.id, accountId));
}

async function connection(status: 'pending' | 'active' | 'revoked') {
  await db
    .delete(whatsappConnections)
    .where(eq(whatsappConnections.accountId, accountId));
  await db.insert(whatsappConnections).values({
    accountId,
    phoneNumberId: `pn-${accountId.slice(0, 8)}`,
    wabaId: `w-${accountId.slice(0, 8)}`,
    status,
  });
}

const left = async () =>
  (await getDashboardOnboardingState(accountId)).whatsappStepLeft;

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `onboarding-dash-${Date.now()}@example.com`,
    password: 'onboarding-dash-pass-1234',
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
    .delete(whatsappConnections)
    .where(eq(whatsappConnections.accountId, accountId));
});

describe('getDashboardOnboardingState', () => {
  it('is false for a legacy account, connected or not', async () => {
    await setAccount('legacy', true);
    expect(await left()).toBe(false);
    await connection('revoked');
    expect(await left()).toBe(false);
  });

  it('is false for a guided account that has not finished', async () => {
    await setAccount('guided', false);
    expect(await left()).toBe(false);
  });

  it('is true for a completed guided account without an active connection', async () => {
    await setAccount('guided', true);
    expect(await left()).toBe(true);
    await connection('pending');
    expect(await left()).toBe(true);
    await connection('revoked');
    expect(await left()).toBe(true);
  });

  it('flips to false once a connection is active', async () => {
    await setAccount('guided', true);
    await connection('revoked');
    expect(await left()).toBe(true);
    await connection('active');
    expect(await left()).toBe(false);
  });

  it('is false for an unknown account', async () => {
    expect(
      (await getDashboardOnboardingState('00000000-0000-0000-0000-000000000000'))
        .whatsappStepLeft,
    ).toBe(false);
  });
});
