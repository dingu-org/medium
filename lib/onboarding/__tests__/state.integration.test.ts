import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { getOnboardingState } from '../state';

let accountId = '';

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `onboarding-services-${Date.now()}@example.com`,
    password: 'onboarding-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Missing user');
  accountId = data.user.id;
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

describe('onboarding service confirmation', () => {
  it('keeps seeded services pending until the practice confirms them', async () => {
    await expect(getOnboardingState(accountId)).resolves.toMatchObject({
      services: false,
    });

    await db
      .update(accounts)
      .set({ servicesConfiguredAt: new Date() })
      .where(eq(accounts.id, accountId));

    await expect(getOnboardingState(accountId)).resolves.toMatchObject({
      services: true,
    });
  });
});

describe('onboarding plan step (soft, never gates the dashboard)', () => {
  it('is false for a Free PT who has not seen the step', async () => {
    await db
      .update(accounts)
      .set({ plan: 'free', planStepSeenAt: null })
      .where(eq(accounts.id, accountId));
    const state = await getOnboardingState(accountId);
    expect(state.plan).toBe(false);
    // The plan step must NEVER change the 5-step completion gate.
    expect(state.total).toBe(5);
    expect(state.complete).toBe(state.completedCount === 5);
  });

  it('is true for a Free PT who saw and skipped the step', async () => {
    await db
      .update(accounts)
      .set({ plan: 'free', planStepSeenAt: new Date() })
      .where(eq(accounts.id, accountId));
    await expect(getOnboardingState(accountId)).resolves.toMatchObject({
      plan: true,
    });
  });

  it('is true for a paid (Solo) PT regardless of the seen flag', async () => {
    await db
      .update(accounts)
      .set({ plan: 'solo', planStepSeenAt: null })
      .where(eq(accounts.id, accountId));
    await expect(getOnboardingState(accountId)).resolves.toMatchObject({
      plan: true,
    });
  });

  it('never counts the plan step toward completedCount', async () => {
    // Even on Solo with the step satisfied, completedCount stays ≤ 5 steps.
    const state = await getOnboardingState(accountId);
    expect(state.completedCount).toBeLessThanOrEqual(5);
    expect(state.total).toBe(5);
  });
});
