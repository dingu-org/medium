'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { accounts } from '@/lib/db/schema';
import { createServerClient } from '@/lib/supabase/server';

/** Advance the unread watermark so the notification bell badge clears. */
export async function markAllNotificationsRead(): Promise<void> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await db
    .update(accounts)
    .set({ notificationsSeenAt: new Date() })
    .where(eq(accounts.id, user.id));

  revalidatePath('/', 'layout');
}
