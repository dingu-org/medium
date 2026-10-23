import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { accounts, services } from '@/lib/db/schema';
import { createServiceClient } from '@/lib/supabase/service';

let accountId = '';

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `signup-trigger-${Date.now()}@example.com`,
    password: 'signup-trigger-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw error ?? new Error('Missing user');
  accountId = data.user.id;
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

describe('signup trigger (migration 0036)', () => {
  it('creates the account without any services', async () => {
    const rows = await db
      .select({ id: services.id })
      .from(services)
      .where(eq(services.accountId, accountId));
    expect(rows).toHaveLength(0);
  });

  it('still sets the account defaults', async () => {
    const [account] = await db
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId));
    expect(account.timezone).toBe('Europe/Tirane');
    expect(account.retentionDays).toBe(90);
    expect(account.onboardingFlow).toBe('guided');
  });
});
