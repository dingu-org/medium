'use server';

import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { pts } from '@/lib/db/schema';
import { instrumentedAction } from '@/lib/actions/instrument';
import { createServerClient } from '@/lib/supabase/server';
import {
  NOTIFICATION_PREF_KEYS,
  type NotificationPrefs,
  type SettingsState,
} from '../constants';

async function updateNotificationPrefsImpl(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in');

  const prefs = Object.fromEntries(
    NOTIFICATION_PREF_KEYS.map((key) => [
      key,
      formData.get(`notify_${key}`) === 'on',
    ]),
  ) as NotificationPrefs;

  await db
    .update(pts)
    .set({ notificationPrefs: prefs })
    .where(eq(pts.id, user.id));

  revalidatePath('/settings/notifications');
  return { error: null, success: true, fieldErrors: null };
}

export const updateNotificationPrefs = instrumentedAction(
  'settings.updateNotificationPrefs',
  updateNotificationPrefsImpl,
);
