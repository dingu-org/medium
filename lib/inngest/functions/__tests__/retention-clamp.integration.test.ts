import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { loadRetentionTenants } from '@/lib/inngest/functions/purge-expired-messages';
import { createServiceClient } from '@/lib/supabase/service';
import { testNowUtc } from '@/tests/support/clock';

const DAY = 86_400_000;
// Derived: the clamp is evaluated as a distance from `now`, never on a date.
const NOW = testNowUtc();
let accountId = '';

async function retentionFor(now: Date): Promise<number | undefined> {
  const tenants = await loadRetentionTenants(now);
  return tenants.find((tenant) => tenant.accountId === accountId)?.retentionDays;
}

beforeAll(async () => {
  const { data, error } = await createServiceClient().auth.admin.createUser({
    email: `retention-clamp-${Date.now()}@example.com`,
    password: 'retention-clamp-pass-1234',
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(error?.message);
  accountId = data.user.id;
});

afterAll(async () => {
  if (accountId) await createServiceClient().auth.admin.deleteUser(accountId);
});

beforeEach(async () => {
  await db
    .update(accounts)
    .set({
      plan: 'free',
      planLifetime: false,
      planExpiresAt: null,
      planDowngradedAt: null,
      retentionDays: 365,
    })
    .where(eq(accounts.id, accountId));
});

describe('loadRetentionTenants — effective retention wiring', () => {
  it('clamps a stored 365 to the Free max once past the 30-day downgrade grace', async () => {
    await db
      .update(accounts)
      .set({ planDowngradedAt: new Date(NOW.getTime() - 31 * DAY) })
      .where(eq(accounts.id, accountId));
    expect(await retentionFor(NOW)).toBe(30);
  });

  it('keeps the stored window during the 30-day downgrade grace', async () => {
    await db
      .update(accounts)
      .set({ planDowngradedAt: new Date(NOW.getTime() - 10 * DAY) })
      .where(eq(accounts.id, accountId));
    expect(await retentionFor(NOW)).toBe(365);
  });

  it('keeps the stored window for a lifetime Solo (no downgrade)', async () => {
    await db
      .update(accounts)
      .set({ plan: 'solo', planLifetime: true })
      .where(eq(accounts.id, accountId));
    expect(await retentionFor(NOW)).toBe(365);
  });
});
