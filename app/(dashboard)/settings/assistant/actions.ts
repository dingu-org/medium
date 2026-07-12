'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { db } from '@/lib/db';
import { pts } from '@/lib/db/schema';
import { instrumentedAction } from '@/lib/actions/instrument';
import { createServerClient } from '@/lib/supabase/server';

async function requirePtId(): Promise<string> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');
  return user.id;
}

async function setAssistantPausedImpl(paused: boolean): Promise<void> {
  const value = z.boolean().parse(paused);
  const ptId = await requirePtId();
  await db
    .update(pts)
    .set({ assistantPaused: value })
    .where(eq(pts.id, ptId));
  revalidatePath('/settings');
  revalidatePath('/settings/assistant');
}

export const setAssistantPaused = instrumentedAction(
  'settings.setAssistantPaused',
  setAssistantPausedImpl,
);
