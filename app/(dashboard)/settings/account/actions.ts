'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { pts } from '@/lib/db/schema';
import { instrumentedAction } from '@/lib/actions/instrument';
import { createServerClient } from '@/lib/supabase/server';
import { RETENTION_OPTIONS } from '../constants';

async function requirePtId(): Promise<string> {
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
  const ptId = await requirePtId();
  await db.update(pts).set({ retentionDays: value }).where(eq(pts.id, ptId));
  revalidatePath('/settings/account');
}

export const updateRetention = instrumentedAction(
  'settings.updateRetention',
  updateRetentionImpl,
);
