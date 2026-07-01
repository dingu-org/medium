import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { pts } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';
import { getOnboardingState } from '../state';

let ptId = '';

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `onboarding-services-${Date.now()}@example.com`,
    password: 'onboarding-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Missing user');
  ptId = data.user.id;
});

afterAll(async () => {
  if (ptId) await createServiceClient().auth.admin.deleteUser(ptId);
});

describe('onboarding service confirmation', () => {
  it('keeps seeded services pending until the practice confirms them', async () => {
    await expect(getOnboardingState(ptId)).resolves.toMatchObject({
      services: false,
    });

    await db
      .update(pts)
      .set({ servicesConfiguredAt: new Date() })
      .where(eq(pts.id, ptId));

    await expect(getOnboardingState(ptId)).resolves.toMatchObject({
      services: true,
    });
  });
});
