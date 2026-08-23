'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { instrumentedAction } from '@/lib/actions/instrument';
import { getPlan } from '@/lib/billing/plans';
import { loadEffectivePlan } from '@/lib/billing/read-model';
import { t } from '@/lib/i18n';
import { createServerClient } from '@/lib/supabase/server';
import { RETENTION_OPTIONS } from '../constants';

async function requireAccountId(): Promise<string> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  return user.id;
}

const retentionSchema = z.coerce
  .number()
  .int()
  .refine(
    (n) => (RETENTION_OPTIONS as readonly number[]).includes(n),
    'Invalid retention period',
  );

/** Set how long conversations are retained; the client only ever sends a
 *  RETENTION_OPTIONS value, so an out-of-range value throws (surfaced as a toast). */
async function updateRetentionImpl(days: number): Promise<void> {
  const value = retentionSchema.parse(days);
  const accountId = await requireAccountId();
  // Plan gate: a longer retention window is Solo-only. Reject a request above
  // the effective plan's max (the UI locks those options too).
  const max = getPlan(await loadEffectivePlan(accountId)).retentionMaxDays;
  if (value > max) throw new Error(t.billing.gateRetention);
  await db.update(accounts).set({ retentionDays: value }).where(eq(accounts.id, accountId));
  revalidatePath('/settings/account');
}

export const updateRetention = instrumentedAction(
  'settings.updateRetention',
  updateRetentionImpl,
);
