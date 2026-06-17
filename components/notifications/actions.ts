'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/lib/db';
import { pts } from '@/lib/db/schema';
import { createServerClient } from '@/lib/supabase/server';

/** Advance the unread watermark so the notification bell badge clears. */
export async function markAllNotificationsRead(): Promise<void> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await db
    .update(pts)
    .set({ notificationsSeenAt: new Date() })
    .where(eq(pts.id, user.id));

  revalidatePath('/', 'layout');
}
